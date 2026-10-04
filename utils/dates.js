// All dates are stored as UTC midnight ("date only"), so seat bookings never shift by timezone.
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

// "Today" in the library's timezone (default India, UTC+5:30)
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

// Monthly / quarterly / half-yearly plans run for calendar months; "custom" plans run for a number of days.
export const PERIOD_MONTHS = {
  monthly: 1,
  quarterly: 3,
  'half-yearly': 6,
}

/** Last day (inclusive) of a membership that starts on `start`. Quarterly from 5 Oct ends on 4 Jan. */
export function planEndDate(plan, start) {
  const months = PERIOD_MONTHS[plan.period]

  if (!months) {
    return addDays(start, plan.durationDays - 1)
  }

  const y = start.getUTCFullYear()
  const m = start.getUTCMonth() + months
  const day = start.getUTCDate()

  const lastDay = new Date(
    Date.UTC(y, m + 1, 0)
  ).getUTCDate() // e.g. 31 Jan + 1 month -> 28 Feb, not 3 Mar

  return addDays(
    new Date(
      Date.UTC(
        y,
        m,
        Math.min(day, lastDay)
      )
    ),
    -1
  )
}

const mins = (t) => {
  const [h, m] = t.split(':').map(Number)

  return h * 60 + m
}

// Do two shifts share any time of the day? (Full Day overlaps Morning and Evening)
export const timesOverlap = (a, b) =>
  mins(a.startTime) < mins(b.endTime) &&
  mins(b.startTime) < mins(a.endTime)

export const bad = (status, message) =>
  Object.assign(
    new Error(message),
    { status }
  )

// ---- helpers for "today / this month" in the library's timezone (as real UTC instants) ----
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
    ) -
      offsetMin() * 60000
  )
}