import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'

import { connectDB } from './config/db.js'
import admissionRoutes from './routes/admissions.js'
import authRoutes from './routes/auth.js'
import studentRoutes from './routes/students.js'
import seatRoutes from './routes/seats.js'
import shiftRoutes from './routes/shifts.js'
import planRoutes from './routes/plans.js'
import membershipRoutes from './routes/memberships.js'
import dashboardRoutes from './routes/dashboard.js'
import paymentRoutes, {
  razorpayWebhook,
} from './routes/payments.js'
import attendanceRoutes from './routes/attendance.js'
import notificationRoutes from './routes/notifications.js'
import noticeRoutes from './routes/notices.js'
import feedbackRoutes from './routes/feedback.js'
import settingsRoutes from './routes/settings.js'
import reportRoutes from './routes/reports.js'

import { loadSettings } from './utils/settings.js'
import { runReminders } from './utils/reminders.js'
import { autoCloseOpenSessions } from './utils/attendance.js'
import seatChangeRequestRoutes from './routes/seatChangeRequests.js'
import {
  sanitizeInput,
  securityHeaders,
  apiLimiter,
  bookingLock,
} from './middleware/security.js'


// Fail fast with a clear message instead of strange errors later
for (const name of ['MONGO_URI', 'JWT_SECRET']) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
}

// In production a weak or copied-from-example secret would let anyone forge login tokens
if (
  process.env.NODE_ENV === 'production' &&
  (process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.startsWith('change-this'))
) {
  console.error(
    'JWT_SECRET is too weak for production. Use a long random string (32+ characters).'
  )
  process.exit(1)
}

const app = express()

app.disable('x-powered-by')

// Render/Heroku sit behind a proxy: needed so req.ip (rate limiting) is the real client
app.set('trust proxy', 1)

// Security headers (nosniff, no framing, CSP, HSTS in production, no cache)
app.use(securityHeaders)

// CLIENT_URL can hold several sites separated by commas.
// (Before, an empty CLIENT_URL silently blocked every browser request.)
const allowedOrigins = (
  process.env.CLIENT_URL || 'http://localhost:5173'
)
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean)

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
)

// Razorpay signs the RAW body, so this route must come before express.json()
app.post(
  '/api/payments/razorpay/webhook',
  express.raw({ type: '*/*' }),
  razorpayWebhook
)

app.use(express.json({ limit: '1mb' }))

// remove "$operator" / "a.b" keys from body, query and params (NoSQL injection)
app.use(sanitizeInput)

// broad per-IP limit for the whole API
app.use('/api', apiLimiter)

app.get('/api/health', (req, res) =>
  res.json({ ok: true })
)

app.use('/api/auth', authRoutes)
app.use('/api/admissions', bookingLock, admissionRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/seats', seatRoutes)
app.use('/api/shifts', shiftRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/memberships', bookingLock, membershipRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/notices', noticeRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/reports', reportRoutes)
app.use(
  '/api/seat-change-requests',
  bookingLock,
  seatChangeRequestRoutes
)


app.use((req, res) =>
  res.status(404).json({ message: 'Route not found' })
)

// Central error handler (Express 5 forwards async errors here)
app.use((err, req, res, next) => {
  if (err.code === 11000) {
    return res.status(409).json({
      message: 'Already exists (duplicate value)',
    })
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: err.message,
    })
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Invalid id',
    })
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      message:
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large (maximum 5 MB)'
          : err.message,
    })
  }

  if (!err.status) {
    console.error(err)
  }

  if (res.headersSent) {
    return next(err)
  }

  const status = err.status || 500

  res.status(status).json({
    // do not leak internal error text to the browser in production
    message:
      status === 500 &&
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error',
  })
})



process.on('unhandledRejection', (reason) =>
  console.error('Unhandled rejection:', reason)
)

await connectDB()

// Settings saved in the app override the .env defaults
await loadSettings()

const port = process.env.PORT || 5000

app.listen(port, () =>
  console.log(`API running on http://localhost:${port}`)
)

// Auto check-out: every 10 minutes, close visits that are still open after closing time
cron.schedule('*/10 * * * *', () =>
  autoCloseOpenSessions().catch((e) =>
    console.error('Auto check-out failed:', e)
  )
)

autoCloseOpenSessions().catch((e) =>
  console.error('Auto check-out failed:', e)
)

// Daily reminders (plan ending, fee pending).
// Also runs once at start-up; it never sends the same reminder twice.
cron.schedule(
  process.env.REMINDER_CRON || '0 9 * * *',
  () =>
    runReminders().catch((e) =>
      console.error('Reminders failed:', e)
    ),
  {
    timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  }
)

runReminders().catch((e) =>
  console.error('Reminders failed:', e)
)