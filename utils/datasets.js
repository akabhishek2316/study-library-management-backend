// Table data for Excel exports.
// Every function returns a list of sheets: { name, columns, rows }.

import User from '../models/User.js'
import Membership from '../models/Membership.js'
import Payment from '../models/Payment.js'
import Attendance from '../models/Attendance.js'

import { withDues } from './payments.js'
import { todayDate, toDay, offsetMin } from './dates.js'
import { monthlyReport } from './attendance.js'
import {
  monthRange,
  ymd,
  minutesOf
} from './attendanceMath.js'

const col = (header, key, width = 16) => ({
  header,
  key,
  width
})

const day = (d) =>
  d ? ymd(new Date(d)) : ''

const stamp = (d) =>
  d
    ? new Date(
        new Date(d).getTime() + offsetMin() * 60000
      )
        .toISOString()
        .replace('T', ' ')
        .slice(0, 16)
    : ''

const hours = (m) =>
  Math.round((m / 60) * 10) / 10

const membershipRefs = (q) =>
  q
    .populate('student', 'name phone')
    .populate('hall', 'name')
    .populate('seat', 'number')
    .populate('plan', 'name')
    .populate('shift', 'name')

export async function students() {
  const today = todayDate()

  const list = await User.find({
    role: 'student'
  })
    .sort({ name: 1 })
    .lean()

  const ms = await withDues(
    await membershipRefs(
      Membership.find({
        student: {
          $in: list.map((s) => s._id)
        },
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
    )
  )

  const by = new Map(
    ms.map((m) => [
      String(m.student._id),
      m
    ])
  )

  return [
    {
      name: 'Students',
      columns: [
        col('Name', 'name', 24),
        col('Email', 'email', 28),
        col('Phone', 'phone'),
col('Joined', 'joined', 12),
        col('Account', 'status', 10),
        col('Seat', 'seat', 8),
        col('Plan', 'plan', 20),
        col('Shift', 'shift', 12),
        col('Valid till', 'till', 12),
        col('Due (Rs.)', 'due', 12)
      ],
      rows: list.map((s) => {
        const m = by.get(String(s._id))

        return {
          name: s.name,
          email: s.email,
          phone: s.phone || '',
          
          joined: day(s.createdAt),
          status: s.status,
          seat:
  m?.hall?.name && m?.seat?.number
    ? `${m.hall.name} - ${m.seat.number}`
    : m?.seat?.number || '',
          plan: m?.plan?.name || '',
          shift: m?.shift?.name || '',
          till: m ? day(m.endDate) : '',
          due: m ? m.due : ''
        }
      })
    }
  ]
}

export async function payments({ from, to } = {}) {
  const q = {
    status: 'paid'
  }

  if (from || to) {
    q.paidAt = {}

    if (from) {
      q.paidAt.$gte = new Date(
        toDay(from).getTime() - offsetMin() * 60000
      )
    }

    if (to) {
      q.paidAt.$lt = new Date(
        toDay(to).getTime() +
          86400000 -
          offsetMin() * 60000
      )
    }
  }

  const list = await Payment.find(q)
    .sort({ paidAt: -1 })
    .limit(20000)
    .populate('student', 'name phone')
   .populate({
  path: 'membership',
  populate: [
    {
      path: 'hall',
      select: 'name'
    },
    {
      path: 'seat',
      select: 'number'
    },
    {
      path: 'plan',
      select: 'name'
    }
  ]
})

  let net = 0

  const rows = list.map((p) => {
    const signed =
      p.type === 'refund'
        ? -p.amount
        : p.amount

    net += signed

    return {
      receipt: p.receiptNo,
      date: stamp(p.paidAt),
      student: p.student?.name || '',
      phone: p.student?.phone || '',
      plan: p.membership?.plan?.name || '',
      seat:
  p.membership?.hall?.name &&
  p.membership?.seat?.number
    ? `${p.membership.hall.name} - ${p.membership.seat.number}`
    : p.membership?.seat?.number || '',
      type: p.type,
      method: p.method,
      amount: signed,
      note: p.note || ''
    }
  })

  rows.push({
    receipt: 'NET TOTAL',
    amount: net
  })

  return [
    {
      name: 'Payments',
      columns: [
        col('Receipt', 'receipt', 16),
        col('Date & time', 'date', 18),
        col('Student', 'student', 22),
        col('Phone', 'phone'),
        col('Plan', 'plan', 20),
        col('Seat', 'seat', 8),
        col('Type', 'type', 10),
        col('Method', 'method', 10),
        col('Amount (Rs.)', 'amount', 14),
        col('Note', 'note', 24)
      ],
      rows
    }
  ]
}

export async function dueMemberships() {
  const ms = await withDues(
    await membershipRefs(
      Membership.find({
        status: {
          $ne: 'cancelled'
        }
      })
        .sort({ endDate: 1 })
        .limit(5000)
    )
  )

  return ms.filter((m) => m.due > 0)
}

export async function dues() {
  const list = await dueMemberships()

  return [
    {
      name: 'Pending dues',
      columns: [
        col('Student', 'student', 22),
        col('Phone', 'phone'),
        col('Seat', 'seat', 8),
        col('Plan', 'plan', 20),
        col('Shift', 'shift', 12),
        col('Ends', 'ends', 12),
        col('Amount (Rs.)', 'amount', 14),
        col('Paid (Rs.)', 'paid', 12),
        col('Due (Rs.)', 'due', 12)
      ],
      rows: [
        ...list.map((m) => ({
          student: m.student?.name,
          phone: m.student?.phone || '',
          seat:
  m.hall?.name && m.seat?.number
    ? `${m.hall.name} - ${m.seat.number}`
    : m.seat?.number || '',
          plan: m.plan?.name,
          shift: m.shift?.name,
          ends: day(m.endDate),
          amount: m.amount,
          paid: m.paid,
          due: m.due
        })),
        {
          student: 'TOTAL',
          due: list.reduce(
            (s, m) => s + m.due,
            0
          )
        }
      ]
    }
  ]
}

export async function memberships() {
  const ms = await withDues(
    await membershipRefs(
      Membership.find()
        .sort({ startDate: -1 })
        .limit(5000)
    )
  )

  return [
    {
      name: 'Memberships',
      columns: [
        col('Student', 'student', 22),
        col('Phone', 'phone'),
        col('Seat', 'seat', 8),
        col('Plan', 'plan', 20),
        col('Shift', 'shift', 12),
        col('Start', 'start', 12),
        col('End', 'end', 12),
        col('Status', 'status', 10),
        col('Amount (Rs.)', 'amount', 14),
        col('Paid (Rs.)', 'paid', 12),
        col('Due (Rs.)', 'due', 12)
      ],
      rows: ms.map((m) => ({
        student: m.student?.name,
        phone: m.student?.phone || '',
        seat:
  m.hall?.name && m.seat?.number
    ? `${m.hall.name} - ${m.seat.number}`
    : m.seat?.number || '',
        plan: m.plan?.name,
        shift: m.shift?.name,
        start: day(m.startDate),
        end: day(m.endDate),
        status: m.status,
        amount: m.amount,
        paid: m.paid,
        due: m.due
      }))
    }
  ]
}

export async function attendance({ month } = {}) {
  const { start, end, label } = monthRange(month)

  const report = await monthlyReport(label)

  const visits = await Attendance.find({
    date: {
      $gte: start,
      $lt: end
    }
  })
    .sort({
      date: 1,
      checkIn: 1
    })
    .populate('student', 'name phone')
    .limit(50000)

  return [
    {
      name: `Summary ${label}`,
      columns: [
        col('Student', 'name', 24),
        col('Phone', 'phone'),
        col('Days present', 'days', 14),
        col('Total hours', 'hours', 14),
        col('Avg hours / day', 'avg', 16),
        col('Last visit', 'last', 12)
      ],
      rows: report.rows.map((r) => ({
        name: r.name,
        phone: r.phone,
        days: r.daysPresent,
        hours: hours(r.minutes),
        avg: r.daysPresent
          ? hours(r.minutes / r.daysPresent)
          : 0,
        last: day(r.last)
      }))
    },
    {
      name: `Visits ${label}`,
      columns: [
        col('Student', 'student', 24),
        col('Phone', 'phone'),
        col('Date', 'date', 12),
        col('Check-in', 'in', 18),
        col('Check-out', 'out', 18),
        col('Minutes', 'min', 10),
        col('Method', 'method', 10),
        col('Auto check-out', 'auto', 14)
      ],
      rows: visits.map((v) => ({
        student: v.student?.name || '',
        phone: v.student?.phone || '',
        date: day(v.date),
        in: stamp(v.checkIn),
        out: stamp(v.checkOut),
        min: minutesOf(v),
        method: v.method,
        auto: v.autoCheckOut ? 'yes' : ''
      }))
    }
  ]
}