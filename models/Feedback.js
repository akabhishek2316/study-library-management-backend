import mongoose from 'mongoose'

const feedbackSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['feedback', 'complaint', 'suggestion'],
      default: 'feedback'
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open'
    },
    reply: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    repliedAt: Date,
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
  },
  { timestamps: true }
)

feedbackSchema.index({ status: 1, createdAt: -1 })

export default mongoose.model('Feedback', feedbackSchema)
