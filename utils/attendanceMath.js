// Pure helpers (no database) so they are easy to test.

import crypto from 'crypto'

import { todayDate, offsetMin } from './dates.js'
import { cfg } from './config.js'

const rotate = () => cfg().qrRotateSeconds

const secret = () => {
  const s =
    process.env.ATTENDANCE_SECRET ||
    process.env.JWT_SECRET

  if (!s) {
    throw new Error(
      'ATTENDANCE_SECRET or JWT_SECRET must be set'
    )
  }

  return s
}

const slotOf = (ms = Date.now()) =>
  Math.floor(ms / 1000 / rotate())

/**
 * 6-digit code for a time slot.
 * It changes every QR_ROTATE_SECONDS, so a photo
 * of the QR is useless later.
 */
export const codeForSlot = (slot) =>
  String(
    parseInt(
      crypto
        .createHmac('sha256', secret())
        .update(`attendance:${slot}`)
        .digest('hex')
        .slice(0, 8),
      16
    ) % 1000000
  ).padStart(6, '0')

export const currentCode = () => ({
  code: codeForSlot(slotOf()),
  rotateSeconds: rotate(),
  secondsLeft:
    rotate() -
    (Math.floor(Date.now() / 1000) % rotate())
})

// Current slot + the previous one (so a code scanned
// just as it rotates still works).
export const isValidCode = (code) => {
  const s = slotOf()
  const a = Buffer.from(String(code))

  return [s, s - 1].some((x) => {
    const b = Buffer.from(codeForSlot(x))

    return (
      a.length === b.length &&
      crypto.timingSafeEqual(a, b)
    )
  })
}

/**
 * Brute-force guard:
 * 8 wrong codes in 10 minutes blocks that student for a while.
 */
const fails = new Map()

export const tooManyFails = (id) => {
  const f = fails.get(id)

  return !!f &&
    f.resetAt > Date.now() &&
    f.count >= 8
}

export const noteFail = (id) => {
  const f = fails.get(id)

  if (!f || f.resetAt <= Date.now()) {
    fails.set(id, {
      count: 1,
      resetAt: Date.now() + 10 * 60000
    })
  } else {
    f.count++
  }
}

export const clearFails = (id) => fails.delete(id)

/**
 * Optional "must be at the library" check.
 */
export const geofenceOn = () => {
  const c = cfg()

  return (
    !!c.geoEnabled &&
    c.geoLat !== null &&
    c.geoLng !== null
  )
}

export function insideGeofence(lat, lng) {
  if (!geofenceOn()) {
    return true
  }

  const c = cfg()

  lat = Number(lat)
  lng = Number(lng)

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return false
  }

  const rad = (x) => (x * Math.PI) / 180

  const dLat = rad(lat - c.geoLat)
  const dLng = rad(lng - c.geoLng)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat)) *
      Math.cos(rad(c.geoLat)) *
      Math.sin(dLng / 2) ** 2

  const meters =
    2 * 6371000 * Math.asin(Math.sqrt(a))

  return meters <= c.geoMeters
}

/**
 * The real moment the library closes on a given
 * library-day (day = UTC-midnight date).
 */
export const closingInstant = (day) => {
  const [h, m] = cfg()
    .closeTime
    .split(':')
    .map(Number)

  return new Date(
    day.getTime() +
      (h * 60 + m) * 60000 -
      offsetMin() * 60000
  )
}

export const ymd = (d) =>
  d.toISOString().slice(0, 10)

export const minutesOf = (s, now = new Date()) =>
  Math.max(
    0,
    Math.round(
      ((s.checkOut || now) - s.checkIn) / 60000
    )
  )

/**
 * Days in a row with attendance, counting back from today
 * (or yesterday if today hasn't happened yet).
 */
export function streakOf(dates, todayStr) {
  const set = new Set(dates)

  let d = new Date(`${todayStr}T00:00:00Z`)

  if (!set.has(todayStr)) {
    d = new Date(d.getTime() - 86400000)
  }

  let n = 0

  while (set.has(ymd(d))) {
    n++
    d = new Date(d.getTime() - 86400000)
  }

  return n
}

/**
 * "YYYY-MM" -> { start, end (exclusive), label };
 * defaults to the current month.
 */
export function monthRange(month) {
  const t = todayDate()

  let y = t.getUTCFullYear()
  let m = t.getUTCMonth() + 1

  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
    [y, m] = month.split('-').map(Number)
  }

  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
    label: `${y}-${String(m).padStart(2, '0')}`
  }
}