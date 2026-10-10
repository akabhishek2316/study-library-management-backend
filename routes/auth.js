import { Router } from 'express'

import User from '../models/User.js'

import { protect, signToken } from '../middleware/auth.js'

import { bad } from '../utils/dates.js'

import { rateLimit } from '../middleware/rateLimit.js'

const router = Router()

// Slow down password guessing and fake sign-ups
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
  key: (req) =>
    `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
})

const changePasswordLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please wait a few minutes and try again.',
  key: (req) => req.ip,
})

const MIN_PASSWORD = 8
const MAX_PASSWORD = 72 // bcrypt only reads the first 72 bytes

const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many sign-ups from this network. Please try again later.',
})

// Student self-registration (role is always "student"; the owner creates owner/staff accounts directly)

router.post('/register', registerLimit, async (req, res) => {
  const { name, email, phone, password } = req.body

  // only plain text is accepted (an object here would be a NoSQL-injection attempt)
  if (
    [name, email, phone, password].some(
      (v) => v !== undefined && typeof v !== 'string'
    )
  ) {
    throw bad(400, 'Invalid input')
  }

  if (!name || !email || !phone || !password) {
    throw bad(
      400,
      'Name, email, phone and password are required'
    )
  }

  if (
    typeof password !== 'string' ||
    !/^\S+@\S+\.\S+$/.test(String(email).trim())
  ) {
    throw bad(400, 'Enter a valid email and password')
  }

  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    throw bad(
      400,
      `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`
    )
  }

  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: 'student',
    admissionStatus: 'pending'
  })
  res.status(201).json({
    token: signToken(user._id),
    user: user.toSafe()
  })
})

router.post('/login', loginLimit, async (req, res) => {
  const { email, password } = req.body

  const user = await User.findOne({
    email: String(email || '').trim().toLowerCase()
  })

  if (!user || !(await user.matchPassword(String(password || '')))) {
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


router.post(
  '/change-password',
  changePasswordLimit,
  protect,
  async (req, res) => {
    const {
      currentPassword,
      newPassword,
    } = req.body

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string'
    ) {
      throw bad(400, 'Invalid input')
    }

    if (
      !currentPassword ||
      !newPassword
    ) {
      throw bad(
        400,
        'Current password and new password are required'
      )
    }

    if (
      newPassword.length < MIN_PASSWORD ||
      newPassword.length > MAX_PASSWORD
    ) {
      throw bad(
        400,
        `New password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`
      )
    }

    if (
      currentPassword === newPassword
    ) {
      throw bad(
        400,
        'New password must be different from current password'
      )
    }

    // protect middleware req.user me password
    // remove kar chuka hai, isliye user ko dobara
    // password ke saath fetch karna zaroori hai.
    const user = await User.findById(
      req.user._id
    )

    if (!user) {
      throw bad(
        401,
        'User not found'
      )
    }

    const matches =
      await user.matchPassword(
        currentPassword
      )

    if (!matches) {
      throw bad(
        400,
        'Current password is incorrect'
      )
    }

    user.password = newPassword

    await user.save()

    // old tokens are now invalid, so hand back a fresh one
    res.json({
      message:
        'Password changed successfully',
      token: signToken(user._id),
    })
  }
)

router.get('/me', protect, (req, res) =>
  res.json({
    user: req.user.toSafe()
  })
)

export default router