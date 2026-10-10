import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export const signToken = (id) =>
  jwt.sign(
    { id },
    process.env.JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  )

export const protect = async (req, res, next) => {
  const h = req.headers.authorization || ''

  const token = h.startsWith('Bearer ')
    ? h.slice(7)
    : null

  if (!token) {
    return res.status(401).json({
      message: 'Not authenticated'
    })
  }

  try {
    const { id, iat } = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ['HS256'] }
    )

    const user = await User.findById(id)
      .select('-password')

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        message: 'Account not active'
      })
    }

    // a token created before the last password change is no longer valid
    if (
      user.passwordChangedAt &&
      Math.floor(user.passwordChangedAt.getTime() / 1000) > iat
    ) {
      return res.status(401).json({
        message: 'Password was changed. Please log in again.'
      })
    }

    req.user = user

    next()
  } catch {
    res.status(401).json({
      message: 'Invalid or expired token'
    })
  }
}

export const allow = (...roles) => (
  req,
  res,
  next
) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      message: 'Not allowed'
    })
  }

  next()
}

export const requireAdmission = (
  req,
  res,
  next
) => {
  if (
    req.user.role !== 'student' ||
    req.user.admissionStatus === 'approved'
  ) {
    return next()
  }

  return res.status(403).json({
    message:
      req.user.admissionStatus === 'rejected'
        ? 'Admission request was rejected.'
        : 'Admission is pending. Please wait for approval.'
  })
}