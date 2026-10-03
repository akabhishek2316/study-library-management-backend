// All dates are stored as UTC midnight ("date only"),
// so seat bookings never shift by timezone.

export const toDay = (v) => {
  const d = new Date(v)

  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate()
    )
  )
}

// "Today" in the library's timezone (default India, UTC+5:30).
export const todayDate = () => {
  const offset = Number(
    process.env.TZ_OFFSET_MINUTES ?? 330
  )

  return toDay(
    new Date(Date.now() + offset * 60000)
  )
}

export const addDays = (d, n) =>
  new Date(d.getTime() + n * 86400000)

const mins = (t) => {
  const [h, m] = t.split(':').map(Number)

  return h * 60 + m
}

// Do two shifts share any time of the day?
// Full Day overlaps Morning and Evening.
export const timesOverlap = (a, b) =>
  mins(a.startTime) < mins(b.endTime) &&
  mins(b.startTime) < mins(a.endTime)

export const bad = (status, message) =>
  Object.assign(
    new Error(message),
    { status }
  )

// ---- Helpers for "today / this month" in the library's timezone ----
// These return real UTC instants.

export const offsetMin = () =>
  Number(process.env.TZ_OFFSET_MINUTES ?? 330)

export const dayStartUtc = () =>
  new Date(
    todayDate().getTime() -
      offsetMin() * 60000
  )

export const monthStartUtc = () => {
  const t = todayDate()

  return new Date(
    Date.UTC(
      t.getUTCFullYear(),
      t.getUTCMonth(),
      1
    ) - offsetMin() * 60000
  )
}