import { Router } from 'express'
import ExcelJS from 'exceljs'

import User from '../models/User.js'
import Seat from '../models/Seat.js'
import Shift from '../models/Shift.js'
import Membership from '../models/Membership.js'
import Payment from '../models/Payment.js'
import Attendance from '../models/Attendance.js'

import { protect, allow } from '../middleware/auth.js'

import {
  bad,
  todayDate,
  addDays,
  offsetMin,
  timesOverlap
} from '../utils/dates.js'

import {
  monthRange,
  ymd,
  minutesOf
} from '../utils/attendanceMath.js'

import { monthlyReport } from '../utils/attendance.js'
import { cfg } from '../utils/config.js'
import * as sets from '../utils/datasets.js'
import { streamMonthlyPdf } from '../utils/monthlyPdf.js'

const router = Router()

router.use(protect, allow('owner'))

/* ---------- Excel exports ---------- */

const KINDS = {
  students: sets.students,
  payments: sets.payments,
  dues: sets.dues,
  memberships: sets.memberships,
  attendance: sets.attendance
}

router.get('/export/:kind', async (req, res) => {
  const make = KINDS[req.params.kind]

  if (!make) {
    throw bad(404, 'Unknown report')
  }

  const sheets = await make(req.query)

  const wb = new ExcelJS.Workbook()

  wb.creator = cfg().libraryName

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31))

    ws.columns = s.columns
    ws.addRows(s.rows)
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${req.params.kind}-${ymd(todayDate())}.xlsx"`
  )

  await wb.xlsx.write(res)

  res.end()
})

/* ---------- Monthly PDF ---------- */

router.get('/monthly.pdf', async (req, res) => {
  const { start, end, label } = monthRange(req.query.month)

  const from = new Date(
    start.getTime() - offsetMin() * 60000
  )

  const to = new Date(
    end.getTime() - offsetMin() * 60000
  )

  const pays = await Payment.find({
    status: 'paid',
    paidAt: {
      $gte: from,
      $lt: to
    }
  })
    .select('amount type method')
    .lean()

  const byMethod = {}

  let collected = 0
  let refunded = 0

  for (const p of pays) {
    if (p.type === 'refund') {
      refunded += p.amount
      continue
    }

    collected += p.amount

    byMethod[p.method] ||= {
      count: 0,
      amount: 0
    }

    byMethod[p.method].count++
    byMethod[p.method].amount += p.amount
  }

  const [
    newStudents,
    newMemberships,
    visits,
    report,
    dueList
  ] = await Promise.all([
    User.countDocuments({
      role: 'student',
      createdAt: {
        $gte: from,
        $lt: to
      }
    }),

    Membership.countDocuments({
      createdAt: {
        $gte: from,
        $lt: to
      }
    }),

    Attendance.countDocuments({
      date: {
        $gte: start,
        $lt: end
      }
    }),

    monthlyReport(label),

    sets.dueMemberships()
  ])

  streamMonthlyPdf(res, {
    month: label,
    collected,
    refunded,
    byMethod,
    newStudents,
    newMemberships,
    visits,

    presentStudents: report.rows.filter(
      (r) => r.daysPresent > 0
    ).length,

    totalMinutes: report.rows.reduce(
      (s, r) => s + r.minutes,
      0
    ),

    top: [...report.rows]
      .sort((a, b) => b.minutes - a.minutes)
      .filter((r) => r.minutes > 0)
      .slice(0, 10),

    totalDue: dueList.reduce(
      (s, m) => s + m.due,
      0
    ),

    dues: [...dueList]
      .sort((a, b) => b.due - a.due)
      .slice(0, 25)
  })
})

/* ---------- Analytics for the charts ---------- */

router.get('/analytics', async (req, res) => {
  const months = Math.min(
    24,
    Math.max(1, Number(req.query.months) || 6)
  )

  const off = offsetMin() * 60000
  const today = todayDate()

  const monthKey = (d) =>
    new Date(
      new Date(d).getTime() + off
    ).toISOString().slice(0, 7)

  // Month buckets, oldest first: "2026-05" ...

  const keys = []

  for (let i = months - 1; i >= 0; i--) {
    keys.push(
      new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth() - i,
          1
        )
      ).toISOString().slice(0, 7)
    )
  }

  const firstStart = new Date(
    Date.UTC(
      +keys[0].slice(0, 4),
      +keys[0].slice(5) - 1,
      1
    ) - off
  )

  const [
    pays,
    joined,
    shifts,
    usableSeats,
    liveMs,
    visits
  ] = await Promise.all([
    Payment.find({
      status: 'paid',
      paidAt: {
        $gte: firstStart
      }
    })
      .select('amount type paidAt')
      .lean(),

    User.find({
      role: 'student',
      createdAt: {
        $gte: firstStart
      }
    })
      .select('createdAt')
      .lean(),

    Shift.find()
      .sort({ startTime: 1 })
      .lean(),

    Seat.countDocuments({
      status: 'active'
    }),

    Membership.find({
      status: {
        $in: ['active', 'paused']
      },
      startDate: {
        $lte: today
      },
      endDate: {
        $gte: today
      }
    })
      .populate('shift')
      .populate('plan', 'name')
      .lean(),

    Attendance.find({
      date: {
        $gte: addDays(today, -29)
      }
    })
      .select('student date checkIn checkOut')
      .lean()
  ])

  const rev = new Map(
    keys.map((k) => [k, 0])
  )

  const joins = new Map(
    keys.map((k) => [k, 0])
  )

  pays.forEach((p) => {
    const k = monthKey(p.paidAt)

    if (rev.has(k)) {
      rev.set(
        k,
        rev.get(k) +
          (p.type === 'refund' ? -p.amount : p.amount)
      )
    }
  })

  joined.forEach((u) => {
    const k = monthKey(u.createdAt)

    if (joins.has(k)) {
      joins.set(k, joins.get(k) + 1)
    }
  })

  const occupancy = shifts.map((s) => {
    const booked = new Set(
      liveMs
        .filter((m) => timesOverlap(m.shift, s))
        .map((m) => String(m.seat))
    ).size

    return {
      shift: s.name,
      booked,
      total: usableSeats,
      percent: usableSeats
        ? Math.round((booked / usableSeats) * 100)
        : 0
    }
  })

  const days = []

  for (let i = 29; i >= 0; i--) {
    days.push(ymd(addDays(today, -i)))
  }

  const perDay = new Map(
    days.map((d) => [
      d,
      {
        students: new Set(),
        minutes: 0
      }
    ])
  )

  const hours = Array(24).fill(0)

  visits.forEach((v) => {
    const d = perDay.get(ymd(v.date))

    if (!d) {
      return
    }

    d.students.add(String(v.student))
    d.minutes += minutesOf(v)

    hours[
      new Date(v.checkIn.getTime() + off).getUTCHours()
    ]++
  })

  const mix = new Map()

  liveMs.forEach((m) => {
    mix.set(
      m.plan?.name || 'Plan',
      (mix.get(m.plan?.name || 'Plan') || 0) + 1
    )
  })

  const revenue = keys.map((k) => ({
    month: k,
    amount: Math.round(rev.get(k))
  }))

  res.json({
    revenue,

    newStudents: keys.map((k) => ({
      month: k,
      count: joins.get(k)
    })),

    thisMonth: revenue.at(-1)?.amount || 0,
    lastMonth: revenue.at(-2)?.amount || 0,

    occupancy,

    attendance: days.map((d) => ({
      date: d,
      students: perDay.get(d).students.size,
      hours: Math.round(
        (perDay.get(d).minutes / 60) * 10
      ) / 10
    })),

    peakHours: hours.map((count, hour) => ({
      hour,
      count
    })),

    planMix: [...mix]
      .map(([plan, count]) => ({
        plan,
        count
      }))
      .sort((a, b) => b.count - a.count)
  })
})

export default router