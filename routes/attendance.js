import { Router } from 'express'
import { rateLimit } from '../middleware/rateLimit.js'
import Attendance from '../models/Attendance.js'
import Membership from '../models/Membership.js'
import User from '../models/User.js'
import { protect, allow } from '../middleware/auth.js'
import { bad, todayDate, addDays } from '../utils/dates.js'
import { cfg } from '../utils/config.js'
import {
  currentCode,
  isValidCode,
  tooManyFails,
  noteFail,
  clearFails,
  geofenceOn,
  insideGeofence,
  streakOf,
  minutesOf,
  monthRange,
  ymd,
} from '../utils/attendanceMath.js'
import {
  autoCloseOpenSessions,
  findAbsent,
  activeMembershipToday,
  monthlyReport,
} from '../utils/attendance.js'

import AttendanceKiosk from '../models/AttendanceKiosk.js'

import {
  attendanceKioskAuth,
} from '../middleware/attendanceKiosk.js'

import {
  createAttendanceKioskToken,
  hashAttendanceKioskToken,
  createAttendanceActivationCode,
  hashAttendanceActivationCode,
} from '../utils/attendanceKiosk.js'

const router = Router()

// The 6-digit kiosk activation code can be guessed, so limit tries
const activateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many activation attempts. Please try again later.',
})

// router.use(protect)

const staff = allow('owner', 'staff')

const view = (s) => ({
  ...(s.toObject ? s.toObject() : s),
  minutes: minutesOf(s),
  open: !s.checkOut
})

const sum = (list) => list.reduce((t, s) => t + s.minutes, 0)

router.get(
  '/config',
  protect,
  staff,
  (req, res) =>
    res.json({
      geofence: geofenceOn(),
      closeTime: cfg().closeTime
    })
)

/* ---------- the rotating code shown on the library's tablet/TV ---------- */
router.get(
  '/code',
  attendanceKioskAuth,
  (req, res) =>
    res.json(currentCode())
)


router.post(
  '/kiosk',
  protect,
  staff,
  async (req, res) => {
    const name = String(
      req.body.name || ''
    ).trim()

    if (!name) {
      throw bad(
        400,
        'Kiosk name is required'
      )
    }

    const activationCode =
      createAttendanceActivationCode()

    const kiosk =
      await AttendanceKiosk.create({
        name,

        activationHash:
          hashAttendanceActivationCode(
            activationCode
          ),

        activationExpiresAt:
          new Date(
            Date.now() +
            10 * 60 * 1000
          ),

        active: true,
      })

    res.status(201).json({
      message:
        'Attendance kiosk created successfully',

      kiosk: {
        id: kiosk._id,
        name: kiosk.name,
        active: kiosk.active,
      },

      activationCode,
    })
  }
)


router.get(
  '/kiosk',
  protect,
  staff,
  async (req, res) => {
    const kiosks =
      await AttendanceKiosk.find()
        .select(
          'name active lastUsedAt createdAt'
        )
        .sort({ createdAt: -1 })
        .lean()

    res.json(kiosks)
  }
)



/* ---------- student: scan (first scan = check-in, next scan = check-out) ---------- */

router.post(
  '/scan',
  protect,
  allow('student'),
  async (req, res) => {
    const id = String(req.user._id)

    if (tooManyFails(id)) {
      throw bad(
        429,
        'Too many wrong attempts. Please try again in a few minutes.'
      )
    }

    const code = String(req.body.code || '')
      .replace(/^SL:/i, '')
      .trim()

    if (!/^\d{6}$/.test(code) || !isValidCode(code)) {
      noteFail(id)

      throw bad(
        400,
        'Invalid or expired code. Please scan the screen again.'
      )
    }

    if (!insideGeofence(req.body.lat, req.body.lng)) {
      throw bad(
        403,
        'You seem to be away from the library. Check-in works only at the library.'
      )
    }

    clearFails(id)

    if (!(await activeMembershipToday(req.user._id))) {
      throw bad(
        403,
        'You have no active membership today. Please contact the library desk.'
      )
    }

    await autoCloseOpenSessions() // closes forgotten visits from earlier days first

    const today = todayDate()
    const now = new Date()

    const open = await Attendance.findOne({
      student: req.user._id,
      checkOut: null
    })

    let action

    if (open) {
      if (now - open.checkIn < 60000) {
        throw bad(
          429,
          'You checked in just now. Please wait a minute before checking out.'
        )
      }

      open.checkOut = now
      await open.save()

      action = 'checkout'
    } else {
      await Attendance.create({
        student: req.user._id,
        date: today,
        checkIn: now,
        method: 'qr'
      })

      action = 'checkin'
    }

    const todays = (
      await Attendance.find({
        student: req.user._id,
        date: today
      })
    ).map(view)

    res.json({
      action,
      at: now,
      todayMinutes: sum(todays)
    })
  })


router.post(
  '/kiosk/activate',
  activateLimit,
  async (req, res) => {
    const code = String(
      req.body.code || ''
    ).trim()

    if (!/^\d{6}$/.test(code)) {
      throw bad(
        400,
        'Enter a valid 6-digit activation code'
      )
    }

    const kiosk =
      await AttendanceKiosk.findOne({
        activationHash:
          hashAttendanceActivationCode(
            code
          ),

        active: true,

        activationExpiresAt: {
          $gt: new Date(),
        },
      })

    if (!kiosk) {
      throw bad(
        401,
        'Invalid or expired activation code'
      )
    }

    const token =
      createAttendanceKioskToken()

    kiosk.tokenHash =
      hashAttendanceKioskToken(token)

    kiosk.activationHash = null
    kiosk.activationExpiresAt = null

    await kiosk.save()

    res.json({
      message:
        'Attendance kiosk activated successfully',

      kiosk: {
        id: kiosk._id,
        name: kiosk.name,
      },

      token,
    })
  }
)



router.patch(
  '/kiosk/:id/disable',
  protect,
  staff,
  async (req, res) => {
    const kiosk =
      await AttendanceKiosk.findByIdAndUpdate(
        req.params.id,
        {
          active: false,
          activationHash: null,
          activationExpiresAt: null,
        },
        {
          new: true,
        }
      )

    if (!kiosk) {
      throw bad(
        404,
        'Attendance kiosk not found'
      )
    }

    res.json({
      message:
        'Attendance kiosk disabled successfully',
    })
  }
)

/* ---------- student: own status + month ---------- */

router.get(
  '/me/today',
  protect,
  allow('student'),
  async (req, res) => {
    const list = (
      await Attendance.find({
        student: req.user._id,
        date: todayDate()
      }).sort({ checkIn: 1 })
    ).map(view)

    res.json({
      open: list.find((s) => s.open) || null,
      sessions: list,
      todayMinutes: sum(list)
    })
  })

router.get(
  '/me',
  protect,
  allow('student'),
  async (req, res) => {
    const { start, end, label } = monthRange(req.query.month)

    const rows = await Attendance.find({
      student: req.user._id,
      date: {
        $gte: start,
        $lt: end
      }
    })

    const byDay = new Map()

    rows.forEach((s) =>
      byDay.set(
        ymd(s.date),
        (byDay.get(ymd(s.date)) || 0) + minutesOf(s)
      )
    )

    const recent = await Attendance.distinct('date', {
      student: req.user._id,
      date: {
        $gte: addDays(todayDate(), -120)
      }
    })

    res.json({
      month: label,
      days: [...byDay].map(([date, minutes]) => ({
        date,
        minutes
      })),
      daysPresent: byDay.size,
      totalMinutes: [...byDay.values()].reduce((a, b) => a + b, 0),
      streak: streakOf(recent.map(ymd), ymd(todayDate()))
    })
  })

/* ---------- staff: live board ---------- */

router.get(
  '/today',
  protect,
  staff,
  async (req, res) => {
    await autoCloseOpenSessions() // in case the server slept through closing time

    const today = todayDate()

    const [sessions, ms] = await Promise.all([
      Attendance.find({ date: today })
        .populate('student', 'name phone')
        .sort({ checkIn: -1 }),

      Membership.find({
        status: 'active',
        startDate: { $lte: today },
        endDate: { $gte: today }
      })
        .populate('student', 'name phone')
        .populate('seat', 'number')
        .populate('shift', 'name')
    ])

    const present = new Set(
      sessions.map((s) => String(s.student?._id))
    )

    const expected = new Map(
      ms
        .filter((m) => m.student)
        .map((m) => [String(m.student._id), m])
    )

    res.json({
      insideNow: sessions.filter((s) => !s.checkOut).length,
      presentToday: present.size,
      expected: expected.size,
      sessions: sessions.map(view),

      notIn: [...expected]
        .filter(([id]) => !present.has(id))
        .map(([, m]) => ({
          student: m.student,
          seat: m.seat,
          shift: m.shift
        }))
    })
  })

/* ---------- staff: monthly report (+ CSV) ---------- */

router.get(
  '/report',
  protect,
  staff,
  async (req, res) =>
    res.json(
      await monthlyReport(req.query.month)
    )
)

router.get(
  '/report.csv',
  protect,
  staff,
  async (req, res) => {
    const { month, rows } = await monthlyReport(req.query.month)

    const q = (v) => {
      let s = String(v ?? '')

      // stop spreadsheet formula injection (=, +, -, @)
      if (/^[=+\-@\t\r]/.test(s)) {
        s = `'${s}`
      }

      return `"${s.replace(/"/g, '""')}"`
    }

    const lines = [
      [
        'Student',
        'Phone',
        'Days present',
        'Total hours',
        'Last visit'
      ].join(',')
    ]

    rows.forEach((r) =>
      lines.push(
        [
          q(r.name),
          q(r.phone),
          r.daysPresent,
          (r.minutes / 60).toFixed(1),
          r.last ? ymd(r.last) : ''
        ].join(',')
      )
    )

    res.setHeader('Content-Type', 'text/csv')

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendance-${month}.csv"`
    )

    res.send(lines.join('\n'))
  })

/* ---------- staff: absence alerts ---------- */

router.get(
  '/absent',
  protect,
  staff,
  async (req, res) =>
    res.json(
      await findAbsent(
        Math.max(
          1,
          Number(req.query.days) || 3
        )
      )
    )
)

/* ---------- staff: manual check-in / check-out and corrections ---------- */

router.post(
  '/manual',
  protect,
  staff,
  async (req, res) => {
    const { studentId, action } = req.body

    const student = await User.findOne({
      _id: studentId,
      role: 'student',
      status: 'active'
    })

    if (!student) {
      throw bad(404, 'Student not found')
    }

    const open = await Attendance.findOne({
      student: student._id,
      checkOut: null
    })

    if (action === 'checkin') {
      if (open) {
        throw bad(400, `${student.name} is already checked in`)
      }

      if (!(await activeMembershipToday(student._id))) {
        throw bad(
          400,
          `${student.name} has no active membership today`
        )
      }

      await Attendance.create({
        student: student._id,
        date: todayDate(),
        checkIn: new Date(),
        method: 'manual'
      })
    } else if (action === 'checkout') {
      if (!open) {
        throw bad(400, `${student.name} is not checked in`)
      }

      open.checkOut = new Date()
      await open.save()
    } else {
      throw bad(400, 'action must be checkin or checkout')
    }

    res.json({ ok: true })
  })

router.delete(
  '/:id',
  protect,
  staff,
  async (req, res) => {
    await Attendance.findByIdAndDelete(req.params.id)

    res.json({
      message: 'Entry deleted'
    })
  })

export default router