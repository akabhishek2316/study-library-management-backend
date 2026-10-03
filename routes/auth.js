import { Router } from 'express'

import User from '../models/User.js'

import { protect, signToken } from '../middleware/auth.js'

import { bad } from '../utils/dates.js'

const router = Router()

// Student self-registration (role is always "student"; the owner creates owner/staff accounts directly)

router.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body

  if (!name || !email || !password) {
    throw bad(400, 'Name, email and password are required')
  }

  if (password.length < 6) {
    throw bad(400, 'Password must be at least 6 characters')
  }

  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: 'student'
  })

  res.status(201).json({
    token: signToken(user._id),
    user: user.toSafe()
  })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body

  const user = await User.findOne({
    email: String(email || '').toLowerCase()
  })

  if (!user || !(await user.matchPassword(password || ''))) {
    throw bad(401, 'Wrong email or password')
  }

  if (user.status !== 'active') {
    throw bad(403, 'Account is inactive. Contact the library.')
  }

  res.json({
    token: signToken(user._id),
    user: user.toSafe()
  })
})

router.get('/me', protect, (req, res) =>
  res.json({
    user: req.user
  })
)

export default router