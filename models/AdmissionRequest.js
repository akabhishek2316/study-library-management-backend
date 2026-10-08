import mongoose from 'mongoose'

const admissionRequestSchema =
  new mongoose.Schema(
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },

      plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: true,
      },

      preferredHall: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hall',
        required: true,
      },

      message: {
        type: String,
        trim: true,
      },

      status: {
        type: String,
        enum: [
          'pending',
          'approved',
          'rejected',
        ],
        default: 'pending',
      },

      adminNote: {
        type: String,
        trim: true,
      },

      reviewedAt: Date,
    },
    {
      timestamps: true,
    }
  )

admissionRequestSchema.index({
  user: 1,
  status: 1,
})

admissionRequestSchema.index({
  preferredHall: 1,
  status: 1,
})

export default mongoose.model(
  'AdmissionRequest',
  admissionRequestSchema
)