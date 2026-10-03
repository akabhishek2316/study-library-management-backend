import crypto from 'crypto'
import Payment from '../models/Payment.js'
import Counter from '../models/Counter.js'
import Membership from '../models/Membership.js'
import { todayDate } from './dates.js'
import { notify } from './notify.js'

const NET = {
  $cond: [
    { $eq: ['$type', 'refund'] },
    { $multiply: ['$amount', -1] },
    '$amount',
  ],
}

// Receipt numbers like SL-2026-00001
// (atomic, so two payments never get the same number)
export async function nextReceiptNo() {
  const year = todayDate().getUTCFullYear()

  const c = await Counter.findOneAndUpdate(
    { _id: `receipt-${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  )

  return `SL-${year}-${String(c.seq).padStart(5, '0')}`
}

// Net money received per membership (payments minus refunds)
export async function paidByMembership(ids) {
  const rows = await Payment.aggregate([
    {
      $match: {
        membership: { $in: ids },
        status: 'paid',
      },
    },
    {
      $group: {
        _id: '$membership',
        net: { $sum: NET },
      },
    },
  ])

  return new Map(
    rows.map((r) => [String(r._id), r.net])
  )
}

// Adds { paid, due } to each membership (docs or plain objects)
export async function withDues(memberships) {
  const map = await paidByMembership(
    memberships.map((m) => m._id)
  )

  return memberships.map((m) => {
    const o =
      typeof m.toObject === 'function'
        ? m.toObject()
        : m

    const paid = map.get(String(m._id)) || 0

    return {
      ...o,
      paid,
      due:
        o.status === 'cancelled'
          ? 0
          : Math.max(
              0,
              +(o.amount - paid).toFixed(2)
            ),
    }
  })
}

export async function totalDues() {
  const ms = await Membership.find({
    status: { $ne: 'cancelled' },
  }).select('amount status')

  return (await withDues(ms)).reduce(
    (sum, m) => sum + m.due,
    0
  )
}

export async function netCollected(from) {
  const rows = await Payment.aggregate([
    {
      $match: {
        status: 'paid',
        paidAt: { $gte: from },
      },
    },
    {
      $group: {
        _id: null,
        net: { $sum: NET },
      },
    },
  ])

  return rows[0]?.net || 0
}

// Moves a pending online payment to "paid" exactly once,
// even if verify and webhook arrive together.
export async function markPaid(payment, extra = {}) {
  const claimed = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      status: 'pending',
    },
    {
      status: 'paid',
      paidAt: new Date(),
      ...extra,
    },
    { new: true }
  )

  if (!claimed) {
    return Payment.findById(payment._id)
  } // someone else already did it

  claimed.receiptNo = await nextReceiptNo()
  await claimed.save()

  notify(claimed.student, {
    type: 'payment',
    title: 'Payment received',
    message: `Rs. ${claimed.amount} received online. Receipt ${claimed.receiptNo}.`,
    link: '/student',
  })

  return claimed
}

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))

  return (
    x.length === y.length &&
    crypto.timingSafeEqual(x, y)
  )
}

export const hmac = (data, secret) =>
  crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex')