import mongoose from 'mongoose'

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // monthly / quarterly / half-yearly = calendar months, custom = durationDays.
    // Older plans are "custom".
    period: {
      type: String,
      enum: ['monthly', 'quarterly', 'half-yearly', 'custom'],
      default: 'custom',
    },

    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },

    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Plan', planSchema)