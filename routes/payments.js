import { Router } from 'express'

import Payment from '../models/Payment.js'
import Membership from '../models/Membership.js'
import User from '../models/User.js'

import { protect, allow } from '../middleware/auth.js'

import {
  bad,
  toDay,
  offsetMin,
} from '../utils/dates.js'

import {
  nextReceiptNo,
  withDues,
  markPaid,
  safeEqual,
  hmac,
} from '../utils/payments.js'

import { streamReceipt } from '../utils/receipt.js'
import { notify } from '../utils/notify.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = Router()

// public receipt check
const verifyLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many checks. Please wait a minute.',
})

const METHODS = [
  'cash',
  'upi',
  'bank',
  'card',
]

// UTR / UPI ref / RRN / cheque no.: letters, digits, - _ / only
const TXN_RE = /^[A-Za-z0-9][A-Za-z0-9\-_/]{5,39}$/

const cleanTxn = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : ''

const maskTxn = (value) =>
  value
    ? `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
    : null

const staff = [
  protect,
  allow('owner', 'staff'),
]

const withRefs = (q) =>
  q
    .populate(
      'student',
      'name phone email'
    )
    .populate(
      'recordedBy',
      'name'
    )
    .populate({
      path: 'membership',
      populate: [
        {
          path: 'hall',
          select:
            'name type description',
        },
        {
          path: 'seat',
          select:
            'number section type',
        },
        {
          path: 'plan',
          select: 'name',
        },
        {
          path: 'shift',
          select: 'name',
        },
      ],
    })

const razorpayOn = () =>
  !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  )

/* ---------- Razorpay webhook ---------- */

export async function razorpayWebhook(
  req,
  res
) {
  const secret =
    process.env.RAZORPAY_WEBHOOK_SECRET

  if (!secret) {
    return res.status(503).json({
      message:
        'Webhook secret not set',
    })
  }

  const signature =
    req.headers[
      'x-razorpay-signature'
    ] || ''

  if (
    !safeEqual(
      hmac(req.body, secret),
      signature
    )
  ) {
    return res.status(400).json({
      message: 'Bad signature',
    })
  }

  const event = JSON.parse(
    req.body.toString('utf8')
  )

  if (
    [
      'payment.captured',
      'order.paid',
    ].includes(event.event)
  ) {
    const p =
      event.payload?.payment?.entity

    const orderId =
      p?.order_id ||
      event.payload?.order?.entity?.id

    const payment =
      orderId &&
      (await Payment.findOne({
        razorpayOrderId: orderId,
      }))

    if (payment) {
      await markPaid(payment, {
        razorpayPaymentId: p?.id,
      })
    }
  }

  res.json({ ok: true })
}

/* ---------- PUBLIC: Verify payment / refund receipt ---------- */

router.get(
  '/verify/:token',
  verifyLimit,
  async (req, res) => {
    try {
      const { token } = req.params

      if (
        !token ||
        !/^[a-f0-9]{48}$/i.test(token)
      ) {
        return res.status(400).json({
          valid: false,
          status: 'INVALID',
          message:
            'Invalid receipt verification link.',
        })
      }

      const payment =
        await Payment.findOne({
          verifyToken: token,
          status: 'paid',
        })
          .select(
            'receiptNo amount method transactionId type paidAt status verifyToken membership student'
          )
          .populate(
            'student',
            'name'
          )
          .populate({
            path: 'membership',
            select:
              'startDate endDate status hall plan seat shift',
            populate: [
              {
                path: 'hall',
                select:
                  'name type description',
              },
              {
                path: 'plan',
                select: 'name',
              },
              {
                path: 'seat',
                select:
                  'number section type',
              },
              {
                path: 'shift',
                select: 'name',
              },
            ],
          })
          .lean()

      if (!payment) {
        return res.status(404).json({
          valid: false,
          status: 'INVALID',
          message:
            'Receipt could not be verified.',
        })
      }

      const isRefund =
        payment.type === 'refund'

      const membership =
        payment.membership

      return res.json({
        valid: true,
        status: 'VERIFIED',
        type: payment.type,
        receiptNo: payment.receiptNo,
        amount: payment.amount,
        method: payment.method,
        // public page: only the last 4 characters
        transactionId: maskTxn(payment.transactionId),
        paidAt: payment.paidAt,
        message: isRefund
          ? 'This refund receipt matches a record in the library system.'
          : 'This receipt matches a payment record in the library system.',
        student: {
          name:
            payment.student?.name ||
            'N/A',
        },
        membership: membership
          ? {
              plan:
                membership.plan
                  ?.name || 'N/A',
              hall:
                membership.hall
                  ?.name || 'N/A',
              seat:
                membership.seat
                  ?.number || 'N/A',
              shift:
                membership.shift
                  ?.name || 'N/A',
              startDate:
                membership.startDate,
              endDate:
                membership.endDate,
              status:
                membership.status,
            }
          : null,
      })
    } catch (error) {
      console.error(
        'Receipt verification error:',
        error
      )

      return res.status(500).json({
        valid: false,
        status: 'ERROR',
        message:
          'Unable to verify receipt right now.',
      })
    }
  }
)

/* ---------- Student: online payment ---------- */

router.post(
  '/razorpay/order',
  protect,
  allow('student'),
  async (req, res) => {
    if (!razorpayOn()) {
      throw bad(
        503,
        'Online payments are not set up yet. Please pay at the desk.'
      )
    }

    const [m] =
      await withDues(
        [
          await Membership.findOne({
            _id:
              req.body.membershipId,
            student:
              req.user._id,
          }),
        ].filter(Boolean)
      )

    if (!m) {
      throw bad(
        404,
        'Membership not found'
      )
    }

    if (m.due <= 0) {
      throw bad(
        400,
        'Nothing is due on this membership'
      )
    }

    const amount = req.body.amount
      ? Number(req.body.amount)
      : m.due

    if (
      !(amount >= 1) ||
      amount > m.due
    ) {
      throw bad(
        400,
        `Enter an amount between 1 and ${m.due}`
      )
    }

    // old unpaid attempts older than a day are just clutter
    await Payment.deleteMany({
      student: req.user._id,
      method: 'online',
      status: 'pending',
      createdAt: { $lt: new Date(Date.now() - 86400000) },
    })

    // at most 3 open payment attempts per membership
    const open = await Payment.countDocuments({
      membership: m._id,
      method: 'online',
      status: 'pending',
    })

    if (open >= 3) {
      throw bad(
        429,
        'You already have payments in progress. Please finish them or wait a few minutes.'
      )
    }

    const payment =
      await Payment.create({
        student: req.user._id,
        membership: m._id,
        amount,
        method: 'online',
        status: 'pending',
      })

    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString('base64')

    const r = await fetch(
      'https://api.razorpay.com/v1/orders',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(
            amount * 100
          ),
          currency: 'INR',
          receipt: String(
            payment._id
          ),
          notes: {
            membershipId: String(
              m._id
            ),
            studentId: String(
              req.user._id
            ),
          },
        }),
      }
    )

    const order = await r.json()

    if (!r.ok) {
      await payment.deleteOne()

      throw bad(
        502,
        order.error?.description ||
          'Could not start the payment'
      )
    }

    payment.razorpayOrderId =
      order.id

    await payment.save()

    res.json({
      orderId: order.id,
      amount: order.amount,
      keyId:
        process.env.RAZORPAY_KEY_ID,
    })
  }
)

router.get(
  '/config',
  protect,
  allow('student'),
  (req, res) => {
    res.json({
      online: razorpayOn(),
    })
  }
)

router.post(
  '/razorpay/verify',
  protect,
  allow('student'),
  async (req, res) => {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature:
        signature,
    } = req.body

    if (!razorpayOn()) {
      throw bad(
        503,
        'Online payments are not set up'
      )
    }

    if (
      !safeEqual(
        hmac(
          `${orderId}|${paymentId}`,
          process.env
            .RAZORPAY_KEY_SECRET
        ),
        signature || ''
      )
    ) {
      throw bad(
        400,
        'Payment verification failed'
      )
    }

    const payment =
      await Payment.findOne({
        razorpayOrderId: orderId,
        student: req.user._id,
      })

    if (!payment) {
      throw bad(
        404,
        'Payment not found'
      )
    }

    const done = await markPaid(
      payment,
      {
        razorpayPaymentId:
          paymentId,
      }
    )

    res.json({
      ok: true,
      receiptNo:
        done.receiptNo,
    })
  }
)

/* ---------- Student: own payments ---------- */

router.get(
  '/mine',
  protect,
  allow('student'),
  async (req, res) => {
    res.json(
      await withRefs(
        Payment.find({
          student: req.user._id,
          status: 'paid',
        })
          .sort({
            paidAt: -1,
          })
          .limit(100)
      )
    )
  }
)

/* ---------- Staff: dues ---------- */

router.get(
  '/dues',
  staff,
  async (req, res) => {
    const ms =
      await Membership.find({
        status: {
          $ne: 'cancelled',
        },
      })
        .populate(
          'student',
          'name phone'
        )
        .populate(
          'hall',
          'name type description'
        )
        .populate(
          'seat',
          'number section type'
        )
        .populate(
          'plan',
          'name'
        )
        .populate(
          'shift',
          'name'
        )
        .sort({
          endDate: 1,
        })
        .limit(1000)

    res.json(
      (
        await withDues(ms)
      ).filter(
        (m) => m.due > 0
      )
    )
  }
)

/* ---------- Staff: payment history ---------- */

router.get(
  '/',
  staff,
  async (req, res) => {
    const {
      from,
      to,
      method,
      student,
    } = req.query

    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 25))
    const search = String(req.query.search || '').trim().slice(0, 60)

    const q = {
      status: 'paid',
    }

    // search: receipt number, transaction id, student name / phone / email
    if (search) {
      const re = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      )

      const people = await User.find(
        {
          role: 'student',
          $or: [{ name: re }, { phone: re }, { email: re }],
        },
        '_id'
      ).limit(200).lean()

      q.$or = [
        { receiptNo: re },
        { transactionId: re },
        { student: { $in: people.map((x) => x._id) } },
      ]
    }

    if (method) {
      q.method = String(method)
    }

    if (student) {
      q.student = String(student)
    }

    if (from || to) {
      q.paidAt = {}

      // Dates are in the library's timezone,
      // so shift them to real UTC instants.

      if (from) {
        q.paidAt.$gte =
          new Date(
            toDay(from).getTime() -
              offsetMin() * 60000
          )
      }

      if (to) {
        q.paidAt.$lt =
          new Date(
            toDay(to).getTime() +
              86400000 -
              offsetMin() * 60000
          )
      }
    }

    const [items, total, grouped] =
      await Promise.all([
        withRefs(
          Payment.find(q)
            .sort({ paidAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
        ),

        Payment.countDocuments(q),

        // totals cover the whole filter, not just this page
        Payment.aggregate([
          { $match: q },
          {
            $group: {
              _id: '$type',
              sum: { $sum: '$amount' },
            },
          },
        ]),
      ])

    const sum = (type) =>
      grouped.find((g) => g._id === type)?.sum || 0

    res.json({
      items,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
      totals: {
        collected:
          sum('payment'),
        refunded:
          sum('refund'),
        net:
          sum('payment') -
          sum('refund'),
      },
    })
  }
)

/* ---------- Staff: manual payment ---------- */

router.post(
  '/',
  staff,
  async (req, res) => {
    const {
      membershipId,
      amount,
      method,
      note,
      transactionId,
    } = req.body

    const amt = Number(amount)

    if (!(amt > 0)) {
      throw bad(
        400,
        'Enter a valid amount'
      )
    }

    if (!METHODS.includes(method)) {
      throw bad(
        400,
        'Choose cash, upi, bank or card'
      )
    }

    // everything except cash needs the bank / UPI reference
    let txn = ''

    if (method !== 'cash') {
      txn = cleanTxn(transactionId)

      if (!TXN_RE.test(txn)) {
        throw bad(
          400,
          'Enter the transaction ID / UTR / reference number (6-40 letters, digits, - _ /)'
        )
      }

      const used = await Payment.exists({
        transactionId: txn,
        type: 'payment',
      })

      if (used) {
        throw bad(
          409,
          'This transaction ID is already recorded for another payment'
        )
      }
    }

    const found =
      await Membership.findById(
        membershipId
      )

    if (!found) {
      throw bad(
        404,
        'Membership not found'
      )
    }

    if (
      found.status ===
      'cancelled'
    ) {
      throw bad(
        400,
        'This membership is cancelled'
      )
    }

    const [m] =
      await withDues([found])

    if (
      amt >
      m.due + 0.001
    ) {
      throw bad(
        400,
        `Amount is more than the due (${m.due})`
      )
    }

    const p =
      await Payment.create({
        student: found.student,
        membership: found._id,
        amount: amt,
        method,
        transactionId: txn || undefined,
        note: typeof note === 'string' ? note.slice(0, 300) : undefined,
        status: 'paid',
        paidAt: new Date(),
        receiptNo:
          await nextReceiptNo(),
        recordedBy:
          req.user._id,
      })

    // two staff members paying at the same moment: undo if it went over the due
    const [after] = await withDues([found])

    if (after.paid > Number(found.amount) + 0.001) {
      await Payment.findByIdAndDelete(p._id)

      throw bad(
        409,
        'Another payment was recorded at the same time. Please refresh and check the due amount.'
      )
    }

    notify(found.student, {
      type: 'payment',
      title: 'Payment received',
      message: `Rs. ${amt} received (${method}). Receipt ${p.receiptNo}.`,
      link: '/student',
    })

    res.status(201).json(
      await withRefs(
        Payment.findById(p._id)
      )
    )
  }
)

/* ---------- Refund ---------- */

router.post(
  '/:id/refund',
  protect,
  allow('owner'),
  async (req, res) => {
    const orig =
      await Payment.findById(
        req.params.id
      )

    if (
      !orig ||
      orig.type !== 'payment' ||
      orig.status !== 'paid'
    ) {
      throw bad(
        404,
        'Payment not found'
      )
    }

    const done =
      await Payment.aggregate([
        {
          $match: {
            refundOf:
              orig._id,
            status: 'paid',
          },
        },
        {
          $group: {
            _id: null,
            t: {
              $sum: '$amount',
            },
          },
        },
      ])

    const left = +(
      orig.amount -
      (done[0]?.t || 0)
    ).toFixed(2)

    const amt = Number(
      req.body.amount
    )

    if (
      !(amt > 0) ||
      amt > left
    ) {
      throw bad(
        400,
        `You can refund at most ${left}`
      )
    }

    const method =
      METHODS.includes(
        req.body.method
      )
        ? req.body.method
        : orig.method ===
          'online'
          ? 'bank'
          : orig.method

    const p =
      await Payment.create({
        student: orig.student,
        membership:
          orig.membership,
        type: 'refund',
        refundOf: orig._id,
        amount: amt,
        method,
        transactionId:
          method !== 'cash' && TXN_RE.test(cleanTxn(req.body.transactionId))
            ? cleanTxn(req.body.transactionId)
            : undefined,
        note: typeof req.body.note === 'string' ? req.body.note.slice(0, 300) : undefined,
        status: 'paid',
        paidAt: new Date(),
        receiptNo:
          await nextReceiptNo(),
        recordedBy:
          req.user._id,
      })

    notify(orig.student, {
      type: 'payment',
      title: 'Refund recorded',
      message: `Rs. ${amt} refunded. Receipt ${p.receiptNo}.`,
      link: '/student',
    })

    res.status(201).json(
      await withRefs(
        Payment.findById(p._id)
      )
    )
  }
)

/* ---------- Receipt PDF ---------- */

router.get(
  '/:id/receipt',
  protect,
  async (req, res) => {
    const p =
      await withRefs(
        Payment.findById(
          req.params.id
        )
      )

    if (
      !p ||
      p.status !== 'paid'
    ) {
      throw bad(
        404,
        'Receipt not found'
      )
    }

    if (
      req.user.role ===
        'student' &&
      String(
        p.student?._id
      ) !==
        String(
          req.user._id
        )
    ) {
      throw bad(
        403,
        'Not allowed'
      )
    }

    const membership = p.membership
      ? await Membership.findById(
          p.membership._id
        )
      : null

    const [m] = membership
      ? await withDues([membership])
      : [{ due: 0 }]

    await streamReceipt(
      res,
      p,
      m.due
    )
  }
)

export default router