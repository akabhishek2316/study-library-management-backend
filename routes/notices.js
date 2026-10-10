import { Router } from 'express'
import Notice from '../models/Notice.js'
import User from '../models/User.js'
import Membership from '../models/Membership.js'

import { protect, allow } from '../middleware/auth.js'

import {
  bad,
  toDay,
  todayDate,
  offsetMin
} from '../utils/dates.js'

import { activeMembershipToday } from '../utils/attendance.js'
import { notify } from '../utils/notify.js'

const router = Router()

router.use(protect)

const staff = allow('owner', 'staff')

const live = () => ({
  $or: [
    { expiresAt: null },
    { expiresAt: { $gt: new Date() } }
  ]
})

// Students see live notices meant for them. Staff see the same list here (use /all for everything).

router.get('/', async (req, res) => {
  const q = live()

  if (req.user.role === 'student') {
    q.audience = (await activeMembershipToday(req.user._id))
      ? { $in: ['all', 'active'] }
      : 'all'
  }

  res.json(
    await Notice.find(q)
      .populate('createdBy', 'name')
      .sort({ pinned: -1, createdAt: -1 })
      .limit(50)
  )
})

router.get('/all', staff, async (req, res) =>
  res.json(
    await Notice.find()
      .populate('createdBy', 'name')
      .sort({ pinned: -1, createdAt: -1 })
      .limit(100)
  )
)

router.post('/', staff, async (req, res) => {
  const {
    title,
    body,
    audience = 'all',
    pinned = false,
    expiresAt,
    sendEmail = false
  } = req.body

  if (!title || !body) {
    throw bad(400, 'Title and message are required')
  }

  let expires = null

  if (expiresAt) {
    const day = toDay(expiresAt)

    if (isNaN(day)) {
      throw bad(400, 'Invalid expiry date')
    }

    expires = new Date(
      day.getTime() + 86400000 - offsetMin() * 60000
    ) // end of that day, library time
  }

  const notice = await Notice.create({
    title,
    body,
    audience,
    pinned,
    expiresAt: expires,
    createdBy: req.user._id
  })

  // tell the students (in the background, so the staff member doesn't wait)

  ;(async () => {
    let ids

    if (audience === 'active') {
      const t = todayDate()

      ids = await Membership.distinct('student', {
        status: 'active',
        startDate: { $lte: t },
        endDate: { $gte: t }
      })
    } else {
      ids = (
        await User.find({
          role: 'student',
          status: 'active'
        }).select('_id')
      ).map((u) => u._id)
    }

    for (const id of ids) {
      await notify(id, {
        type: 'notice',
        title: notice.title,
        message: notice.body.slice(0, 160),
        link: '/student/notices',
        email: !!sendEmail,
        dedupeKey: `notice:${notice._id}`
      })
    }
  })().catch((e) =>
    console.error('Notice fan-out failed:', e)
  )

  res.status(201).json(notice)
})

router.put('/:id', staff, async (req, res) => {
  const { title, body, pinned } = req.body

  const n = await Notice.findByIdAndUpdate(
    req.params.id,
    { title, body, pinned },
    { new: true, runValidators: true }
  )

  if (!n) {
    throw bad(404, 'Notice not found')
  }

  res.json(n)
})

// remove every notice whose end date has passed
router.delete('/expired/all', staff, async (req, res) => {
  const result = await Notice.deleteMany({
    expiresAt: { $lt: new Date() },
  })

  res.json({ deleted: result.deletedCount })
})

router.delete('/:id', staff, async (req, res) => {
  await Notice.findByIdAndDelete(req.params.id)

  res.json({
    message: 'Notice deleted'
  })
})

export default router