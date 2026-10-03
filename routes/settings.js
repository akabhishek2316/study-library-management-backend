import { Router } from 'express'

import { protect, allow } from '../middleware/auth.js'

import { bad } from '../utils/dates.js'
import { cfg } from '../utils/config.js'
import { saveSettings } from '../utils/settings.js'
import { mailEnabled } from '../utils/mailer.js'
import { makeBackup } from '../utils/backup.js'

const router = Router()

router.use(protect, allow('owner'))

const integrations = () => ({
  email: mailEnabled(),
  razorpay: !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  ),
  razorpayWebhook: !!process.env.RAZORPAY_WEBHOOK_SECRET
})

router.get('/', (req, res) =>
  res.json({
    settings: cfg(),
    integrations: integrations()
  })
)

router.put('/', async (req, res) => {
  const b = req.body
  const patch = {}

  const text = (k, max) => {
    if (b[k] !== undefined) {
      patch[k] = String(b[k]).trim().slice(0, max)
    }
  }

  text('libraryName', 80)
  text('address', 200)
  text('phone', 30)

  if (patch.libraryName === '') {
    delete patch.libraryName
  }

  if (b.closeTime !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.closeTime)) {
      throw bad(
        400,
        'Closing time must look like 22:00'
      )
    }

    patch.closeTime = b.closeTime
  }

  if (b.qrRotateSeconds !== undefined) {
    const n = Number(b.qrRotateSeconds)

    if (!(n >= 15 && n <= 300)) {
      throw bad(
        400,
        'QR change time must be between 15 and 300 seconds'
      )
    }

    patch.qrRotateSeconds = Math.round(n)
  }

  if (b.remindDays !== undefined) {
    const arr = (
      Array.isArray(b.remindDays)
        ? b.remindDays
        : String(b.remindDays).split(',')
    ).map((x) => Number(String(x).trim()))

    if (
      arr.length === 0 ||
      arr.length > 6 ||
      arr.some(
        (x) =>
          !Number.isInteger(x) ||
          x < 0 ||
          x > 30
      )
    ) {
      throw bad(
        400,
        'Reminder days: up to 6 whole numbers between 0 and 30, like 7,3,1,0'
      )
    }

    patch.remindDays = [...new Set(arr)].sort(
      (a, c) => c - a
    )
  }

  if (b.geoEnabled !== undefined) {
    patch.geoEnabled = !!b.geoEnabled
  }

  if (b.geoLat !== undefined) {
    const n = Number(b.geoLat)

    if (!(n >= -90 && n <= 90)) {
      throw bad(
        400,
        'Latitude must be between -90 and 90'
      )
    }

    patch.geoLat = n
  }

  if (b.geoLng !== undefined) {
    const n = Number(b.geoLng)

    if (!(n >= -180 && n <= 180)) {
      throw bad(
        400,
        'Longitude must be between -180 and 180'
      )
    }

    patch.geoLng = n
  }

  if (b.geoMeters !== undefined) {
    const n = Number(b.geoMeters)

    if (!(n >= 20 && n <= 2000)) {
      throw bad(
        400,
        'Distance must be between 20 and 2000 metres'
      )
    }

    patch.geoMeters = Math.round(n)
  }

  const merged = {
    ...cfg(),
    ...patch
  }

  if (
    merged.geoEnabled &&
    (
      merged.geoLat === null ||
      merged.geoLng === null
    )
  ) {
    throw bad(
      400,
      'Set the library location (latitude and longitude) before turning the location check on'
    )
  }

  await saveSettings(patch)

  res.json({
    settings: cfg(),
    integrations: integrations()
  })
})

// Full backup (includes password hashes, so keep the file private)

router.get('/backup', async (req, res) => {
  const backup = await makeBackup()

  res.setHeader(
    'Content-Type',
    'application/json'
  )

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="study-library-backup-${backup.createdAt.slice(0, 10)}.json"`
  )

  res.send(JSON.stringify(backup))
})

export default router