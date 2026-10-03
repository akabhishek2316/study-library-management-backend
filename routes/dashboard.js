import { Router } from 'express'

import User from '../models/User.js'
import Seat from '../models/Seat.js'
import Membership from '../models/Membership.js'

import { protect, allow } from '../middleware/auth.js'

import {
  todayDate,
  addDays,
  dayStartUtc,
  monthStartUtc
} from '../utils/dates.js'

import { netCollected, totalDues } from '../utils/payments.js'

import Attendance from '../models/Attendance.js'
import Feedback from '../models/Feedback.js'

import {
  findAbsent,
  autoCloseOpenSessions
} from '../utils/attendance.js'

const router = Router()

router.use(protect, allow('owner', 'staff'))

router.get('/stats', async (req, res) => {
  await autoCloseOpenSessions()

  const today = todayDate()

  const live = {
    status: 'active',
    startDate: { $lte: today },
    endDate: { $gte: today }
  }

  const [
    students,
    usableSeats,
    liveMemberships,
    expiring,
    collectedToday,
    collectedMonth,
    pendingDues,
    insideNow,
    presentList,
    absent,
    openFeedback
  ] = await Promise.all([
    User.countDocuments({
      role: 'student',
      status: 'active'
    }),

    Seat.countDocuments({
      status: 'active'
    }),

    Membership.find(live).select('seat'),

    Membership.find({
      ...live,
      endDate: {
        $gte: today,
        $lte: addDays(today, 7)
      }
    })
      .populate('student', 'name phone')
      .populate('seat', 'number')
      .populate('plan', 'name')
      .sort({ endDate: 1 })
      .limit(20),

    netCollected(dayStartUtc()),

    netCollected(monthStartUtc()),

    totalDues(),

    Attendance.countDocuments({
      date: today,
      checkOut: null
    }),

    Attendance.distinct('student', {
      date: today
    }),

    findAbsent(3),

    Feedback.countDocuments({
      status: 'open'
    })
  ])

  const seatsInUse = new Set(
    liveMemberships.map((m) => String(m.seat))
  ).size

  res.json({
    students,
    usableSeats,
    seatsInUse,

    occupancy: usableSeats
      ? Math.round((seatsInUse / usableSeats) * 100)
      : 0,

    activeMemberships: liveMemberships.length,
    expiring,
    collectedToday,
    collectedMonth,
    pendingDues,
    insideNow,
    presentToday: presentList.length,
    absent3: absent.length,
    openFeedback
  })
})

export default router