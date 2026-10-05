import { Router } from 'express'

import Notification from '../models/Notification.js'

import { protect, allow } from '../middleware/auth.js'

import { runReminders } from '../utils/reminders.js'

const router = Router()

router.use(protect)

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 100)

  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit),

    Notification.countDocuments({
      user: req.user._id,
      read: false
    })
  ])

  res.json({
    items,
    unread
  })
})

router.get('/unread-count', async (req, res) =>
  res.json({
    unread: await Notification.countDocuments({
      user: req.user._id,
      read: false
    })
  })
)

router.post('/read-all', async (req, res) => {
  await Notification.updateMany(
    {
      user: req.user._id,
      read: false
    },
    {
      read: true,
      readAt: new Date()
    }
  )

  res.json({
    ok: true
  })
})

router.patch('/:id/read', async (req, res) => {
  await Notification.updateOne(
    {
      _id: req.params.id,
      user: req.user._id
    },
    {
      read: true,
      readAt: new Date()
    }
  )

  res.json({
    ok: true
  })
})


router.delete('/', async (req, res) => {
  await Notification.deleteMany({
    user: req.user._id,
  })

  res.json({
    message: 'All notifications cleared',
  })
})

// Run the daily reminders right now (handy for testing, or if your host sleeps at 9 AM)

router.post(
  '/run-reminders',
  allow('owner'),
  async (req, res) => res.json(await runReminders())
)

export default router