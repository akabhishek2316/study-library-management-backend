import { Router } from 'express'
import Feedback from '../models/Feedback.js'
import { protect, allow } from '../middleware/auth.js'
import { bad } from '../utils/dates.js'
import { notify, notifyStaff } from '../utils/notify.js'

const router = Router()

router.use(protect)

/* ---- student ---- */

router.post('/', allow('student'), async (req, res) => {
  const { type, subject, message } = req.body

  if (!subject || !message) {
    throw bad(400, 'Subject and message are required')
  }

  const f = await Feedback.create({
    student: req.user._id,
    type,
    subject,
    message
  })

  notifyStaff({
    type: 'feedback',
    title: `New ${f.type} from ${req.user.name}`,
    message: f.subject,
    link: '/admin/feedback'
  })

  res.status(201).json(f)
})

router.get('/mine', allow('student'), async (req, res) =>
  res.json(
    await Feedback.find({
      student: req.user._id
    }).sort({ createdAt: -1 })
  )
)

/* ---- staff ---- */

router.get('/', allow('owner', 'staff'), async (req, res) => {
  const q = req.query.status
    ? { status: req.query.status }
    : {}

  res.json(
    await Feedback.find(q)
      .populate('student', 'name phone')
      .populate('repliedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(200)
  )
})

// reply and/or change status. Replying resolves it unless you say otherwise.

router.patch('/:id', allow('owner', 'staff'), async (req, res) => {
  const f = await Feedback.findById(req.params.id)

  if (!f) {
    throw bad(404, 'Not found')
  }

  const { reply, status } = req.body

  if (reply?.trim()) {
    f.reply = reply.trim()
    f.repliedAt = new Date()
    f.repliedBy = req.user._id

    f.status = status || 'resolved'

    notify(f.student, {
      type: 'feedback',
      title: 'Reply to your message',
      message: f.reply.slice(0, 160),
      link: '/student/feedback'
    })
  } else if (['open', 'resolved'].includes(status)) {
    f.status = status
  }

  await f.save()

  res.json(
    await Feedback.findById(f._id)
      .populate('student', 'name phone')
      .populate('repliedBy', 'name')
  )
})

export default router