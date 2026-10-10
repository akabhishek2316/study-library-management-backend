import mongoose from 'mongoose'
import crypto from 'node:crypto'

const ref = (name, extra = {}) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: name,
  ...extra
})

const paymentSchema = new mongoose.Schema(
  {
    student: ref('User', {
      required: true
    }),

    membership: ref('Membership', {
      required: true
    }),

    type: {
      type: String,
      enum: ['payment', 'refund'],
      default: 'payment'
    },

    refundOf: ref('Payment'), // set on refunds: which payment is being refunded

    amount: {
      type: Number,
      required: true,
      min: 0.01
    }, // always positive; "type" says which direction

    method: {
      type: String,
      enum: ['cash', 'upi', 'bank', 'card', 'online'],
      required: true
    },

    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'paid'
    },

    receiptNo: {
      type: String,
      unique: true,
      sparse: true
    },

    verifyToken: {
      type: String,
      unique: true,
      sparse: true,
      default: () => crypto.randomBytes(24).toString('hex')
    },

    paidAt: Date,

    note: String,

    recordedBy: ref('User'),

    razorpayOrderId: {
      type: String,
      index: true,
      sparse: true
    },

    razorpayPaymentId: String,

    // UPI / bank / card reference (UTR, RRN, approval code ...).
    // Required for every method except cash. Printed on the receipt.
    transactionId: {
      type: String,
      trim: true,
      maxlength: 64
    }
  },
  { timestamps: true }
)

// the same bank/UPI reference cannot be entered for two different payments
paymentSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: 'payment',
      transactionId: { $type: 'string' }
    }
  }
)

paymentSchema.index({ paidAt: -1 })

export default mongoose.model('Payment', paymentSchema)