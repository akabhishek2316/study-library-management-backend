import { Router } from 'express'
import crypto from 'crypto'

import User from '../models/User.js'
import Membership from '../models/Membership.js'

import { protect, allow } from '../middleware/auth.js'

import { bad, todayDate } from '../utils/dates.js'

const router = Router()

router.use(protect, allow('owner', 'staff'))

const FIELDS = [
  'name',
  'email',
  'phone',
  'photo',
  'idProof',
  'emergencyContact'
]

const pick = (body) =>
  Object.fromEntries(
    FIELDS
      .filter((k) => body[k] !== undefined)
      .map((k) => [k, body[k]])
  )

router.get('/', async (req, res) => {
  const { q, status = 'active' } = req.query

  const filter = { role: 'student' }

  if (status !== 'all') {
    filter.status = status
  }

  if (q) {
    const rx = new RegExp(
      String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    )

    filter.$or = [
      { name: rx },
      { email: rx },
      { phone: rx }
    ]
  }

  const students = await User.find(filter)
    .select('-password')
    .sort({ name: 1 })
    .lean()

  // Attach each student's current membership (seat + plan) for the list view.
  const today = todayDate()

  const current = await Membership.find({
    student: {
      $in: students.map((s) => s._id)
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
    .populate('seat', 'number')
    .populate('plan', 'name')
    .populate('shift', 'name')
    .lean()

  const byStudent = new Map(
    current.map((m) => [String(m.student), m])
  )

  res.json(
    students.map((s) => ({
      ...s,
      current: byStudent.get(String(s._id)) || null
    }))
  )
})

router.post('/', async (req, res) => {
  const data = pick(req.body)

  if (!data.name || !data.email) {
    throw bad(400, 'Name and email are required')
  }

  // Owner can set a password; otherwise, generate a temporary one and show it once.
  const tempPassword =
    req.body.password || crypto.randomBytes(4).toString('hex')

  const student = await User.create({
    ...data,
    password: tempPassword,
    role: 'student'
  })

  res.status(201).json({
    student: student.toSafe(),
    tempPassword
  })
})

router.get('/:id', async (req, res) => {
  const student = await User.findOne({
    _id: req.params.id,
    role: 'student'
  }).select('-password')

  if (!student) {
    throw bad(404, 'Student not found')
  }

  res.json(student)
})

router.put('/:id', async (req, res) => {
  const student = await User.findOneAndUpdate(
    {
      _id: req.params.id,
      role: 'student'
    },
    pick(req.body),
    {
      new: true,
      runValidators: true
    }
  ).select('-password')

  if (!student) {
    throw bad(404, 'Student not found')
  }

  res.json(student)
})

// "Delete" = deactivate. Active memberships are cancelled so the seat becomes free again.
router.delete('/:id', async (req, res) => {
  const student = await User.findOneAndUpdate(
    {
      _id: req.params.id,
      role: 'student'
    },
    {
      status: 'inactive'
    },
    {
      new: true
    }
  )

  if (!student) {
    throw bad(404, 'Student not found')
  }

  await Membership.updateMany(
    {
      student: student._id,
      status: {
        $in: ['active', 'paused']
      }
    },
    {
      status: 'cancelled'
    }
  )

  res.json({
    message: 'Student deactivated'
  })
})

export default router