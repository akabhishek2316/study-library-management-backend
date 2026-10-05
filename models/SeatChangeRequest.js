import mongoose from 'mongoose'

const seatChangeRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    membership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Membership',
      required: true,
    },

    currentSeat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seat',
      required: true,
    },

    requestedSeat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seat',
      required: true,
    },

    reason: {
      type: String,
      trim: true,
      default: '',
    },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewMessage: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
)

seatChangeRequestSchema.index({
  student: 1,
  status: 1,
})

seatChangeRequestSchema.index({
  membership: 1,
  status: 1,
})

export default mongoose.model(
  'SeatChangeRequest',
  seatChangeRequestSchema
)