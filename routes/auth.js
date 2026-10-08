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
    role: 'student',
    admissionStatus: 'pending'
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


router.post(
  '/change-password',
  protect,
  async (req, res) => {
    const {
      currentPassword,
      newPassword,
    } = req.body

    if (
      !currentPassword ||
      !newPassword
    ) {
      throw bad(
        400,
        'Current password and new password are required'
      )
    }

    if (newPassword.length < 6) {
      throw bad(
        400,
        'New password must be at least 6 characters'
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
        401,
        'Current password is incorrect'
      )
    }

    user.password = newPassword

    await user.save()

    res.json({
      message:
        'Password changed successfully',
    })
  }
)

router.get('/me', protect, (req, res) =>
  res.json({
    user: req.user
  })
)

export default router