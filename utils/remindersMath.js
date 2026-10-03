// Pure helpers for reminders (no database).

import { cfg } from './config.js'

export const remindDays = () =>
  cfg().remindDays

export const daysBetween = (from, to) =>
  Math.round((to - from) / 86400000)

// ISO week like "2026-W40":
// dues reminders go out at most once per week per membership.
export function weekKey(d) {
  const t = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate()
    )
  )

  t.setUTCDate(
    t.getUTCDate() + 4 - (t.getUTCDay() || 7)
  )

  const jan1 = new Date(
    Date.UTC(t.getUTCFullYear(), 0, 1)
  )

  const week = Math.ceil(
    ((t - jan1) / 86400000 + 1) / 7
  )

  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const whenText = (days) =>
  days === 0
    ? 'today'
    : days === 1
      ? 'tomorrow'
      : `in ${days} days`