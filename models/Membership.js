import mongoose from 'mongoose'

const ref = (name) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: name,
  required: true,
})

const membershipSchema =
  new mongoose.Schema(
    {
      student: ref('User'),

      plan: ref('Plan'),

      hall: ref('Hall'),

      seat: ref('Seat'),

      shift: ref('Shift'),

      startDate: {
        type: Date,
        required: true,
      },

      endDate: {
        type: Date,
        required: true,
      },

      status: {
        type: String,
        enum: [
          'active',
          'paused',
          'cancelled',
        ],
        default: 'active',
      },

      // price at the time of purchase
      amount: {
        type: Number,
        required: true,
      },
    },
    {
      timestamps: true,
    }
  )

membershipSchema.index({
  seat: 1,
  startDate: 1,
  endDate: 1,
})

membershipSchema.index({
  student: 1,
})

export default mongoose.model(
  'Membership',
  membershipSchema
)