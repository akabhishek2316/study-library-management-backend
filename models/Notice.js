import mongoose from 'mongoose'

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    // all students, or only those with a running plan
    audience: {
      type: String,
      enum: ['all', 'active'],
      default: 'all'
    }, 
    pinned: {
      type: Boolean,
      default: false
    },
    expiresAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
  },
  { timestamps: true }
)

export default mongoose.model('Notice', noticeSchema)
