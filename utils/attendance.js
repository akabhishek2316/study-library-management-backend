import Attendance from '../models/Attendance.js'
import Membership from '../models/Membership.js'
import User from '../models/User.js'

import { todayDate } from './dates.js'
import {
  closingInstant,
  monthRange
} from './attendanceMath.js'

export const activeMembershipToday = (studentId) =>
  Membership.findOne({
    student: studentId,
    status: 'active',
    startDate: {
      $lte: todayDate()
    },
    endDate: {
      $gte: todayDate()
    }
  })

/**
 * Closes every visit still open after its closing time
 * (forgot to scan out).
 * Runs every 10 min and before each scan.
 */
export async function autoCloseOpenSessions() {
  const open = await Attendance.find({
    checkOut: null
  })

  let closed = 0

  for (const s of open) {
    const close = closingInstant(s.date)

    if (Date.now() < close.getTime()) {
      continue
    }

    // Never earlier than the check-in.
    s.checkOut = close > s.checkIn
      ? close
      : s.checkIn

    s.autoCheckOut = true

    await s.save()

    closed++
  }

  return closed
}

/**
 * Members with a running plan who haven't come
 * for `days` days or more.
 */
export async function findAbsent(days = 3) {
  const today = todayDate()

  const ms = await Membership.find({
    status: 'active',
    startDate: {
      $lte: today
    },
    endDate: {
      $gte: today
    }
  })
    .populate('student', 'name phone status')
    .populate('seat', 'number')
    .populate('shift', 'name')

  const ids = ms
    .map((m) => m.student?._id)
    .filter(Boolean)

  const last = await Attendance.aggregate([
    {
      $match: {
        student: {
          $in: ids
        }
      }
    },
    {
      $group: {
        _id: '$student',
        last: {
          $max: '$date'
        }
      }
    }
  ])

  const lastBy = new Map(
    last.map((r) => [
      String(r._id),
      r.last
    ])
  )

  const seen = new Set()
  const out = []

  for (const m of ms) {
    if (
      !m.student ||
      m.student.status !== 'active' ||
      seen.has(String(m.student._id))
    ) {
      continue
    }

    seen.add(String(m.student._id))

    const lastSeen =
      lastBy.get(String(m.student._id)) || null

    // Never came: count from the day before they started.
    const ref = lastSeen ||
      new Date(m.startDate.getTime() - 86400000)

    const absentDays = Math.round(
      (today - ref) / 86400000
    )

    if (absentDays >= days) {
      out.push({
        student: m.student,
        seat: m.seat,
        shift: m.shift,
        lastSeen,
        absentDays
      })
    }
  }

  return out.sort(
    (a, b) => b.absentDays - a.absentDays
  )
}

/**
 * One row per active student for a month:
 * days present, total minutes, last visit.
 */
export async function monthlyReport(month) {
  const { start, end, label } = monthRange(month)

  const rows = await Attendance.aggregate([
    {
      $match: {
        date: {
          $gte: start,
          $lt: end
        }
      }
    },
    {
      $project: {
        student: 1,
        date: 1,
        mins: {
          $divide: [
            {
              $subtract: [
                {
                  $ifNull: [
                    '$checkOut',
                    '$$NOW'
                  ]
                },
                '$checkIn'
              ]
            },
            60000
          ]
        }
      }
    },
    {
      $group: {
        _id: '$student',
        days: {
          $addToSet: '$date'
        },
        minutes: {
          $sum: '$mins'
        },
        last: {
          $max: '$date'
        }
      }
    }
  ])

  const by = new Map(
    rows.map((r) => [
      String(r._id),
      r
    ])
  )

  const students = await User.find({
    role: 'student',
    status: 'active'
  })
    .select('name phone')
    .sort({ name: 1 })
    .lean()

  return {
    month: label,
    rows: students.map((s) => {
      const r = by.get(String(s._id))

      return {
        studentId: s._id,
        name: s.name,
        phone: s.phone || '',
        daysPresent: r ? r.days.length : 0,
        minutes: Math.round(r?.minutes || 0),
        last: r?.last || null
      }
    })
  }
}