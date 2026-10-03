import Membership from '../models/Membership.js'
import { todayDate, addDays } from './dates.js'
import { withDues } from './payments.js'
import { notify } from './notify.js'
import {
  remindDays,
  daysBetween,
  weekKey,
  whenText,
} from './remindersMath.js'

const d10 = (d) => d.toISOString().slice(0, 10)

/**
 * Daily job (also safe to run any number of times:
 * each reminder is sent once thanks to dedupeKey).
 *
 * 1. "Your plan ends in N days" (7, 3, 1 and 0 days by default),
 *    skipped if the student already renewed.
 * 2. "Fee pending", at most once a week per membership.
 */
export async function runReminders() {
  const today = todayDate()
  const days = remindDays()

  let expiry = 0
  let dues = 0

  const ending = await Membership.find({
    status: 'active',
    startDate: { $lte: today },
    endDate: {
      $gte: today,
      $lte: addDays(today, Math.max(0, ...days)),
    },
  })
    .populate('seat', 'number')
    .populate('plan', 'name')

  const renewed = await Membership.find({
    student: { $in: ending.map((m) => m.student) },
    status: 'active',
    startDate: { $gt: today },
  }).select('student startDate')

  for (const m of ending) {
    const left = daysBetween(today, m.endDate)

    if (!days.includes(left)) continue

    if (
      renewed.some(
        (r) =>
          String(r.student) === String(m.student) &&
          r.startDate > m.endDate
      )
    ) {
      continue // already renewed
    }

    const n = await notify(m.student, {
      type: 'expiry',
      title: 'Your plan is ending soon',
      message: `Your ${m.plan?.name} (seat ${m.seat?.number}) ends ${whenText(left)} (${d10(m.endDate)}). Please renew at the desk to keep your seat.`,
      link: '/student',
      email: true,
      dedupeKey: `expiry:${m._id}:${left}`,
    })

    if (n) expiry++
  }

  const open = await Membership.find({
    status: { $ne: 'cancelled' },
    startDate: { $lte: today },
    endDate: { $gte: addDays(today, -30) },
  }).populate('plan', 'name')

  for (const m of await withDues(open)) {
    if (m.due <= 0) continue

    const n = await notify(m.student, {
      type: 'due',
      title: 'Fee pending',
      message: `Rs. ${m.due} is pending for your ${m.plan?.name}. You can pay online from the app, or at the desk.`,
      link: '/student',
      email: true,
      dedupeKey: `due:${m._id}:${weekKey(today)}`,
    })

    if (n) dues++
  }

  return { expiry, dues }
}