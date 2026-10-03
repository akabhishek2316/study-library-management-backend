import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['payment', 'membership', 'expiry', 'due', 'notice', 'feedback', 'info'],
      default: 'info'
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      default: ''
    },
    // app page to open when tapped, e.g. /student/notices
    link: {
      type: String,
      default: ''
    },
    read: {
      type: Boolean,
      default: false
    },
    readAt: Date,
    // makes reminders idempotent: the same reminder is never created twice for a user
    dedupeKey: String,
  },
  { timestamps: true }
)

notificationSchema.index({ user: 1, read: 1, createdAt: -1 })
notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      dedupeKey: { $type: 'string' }
    }
  }
)
// old notifications clean themselves up after 90 days

notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 86400 }
)
export default mongoose.model('Notification', notificationSchema)
