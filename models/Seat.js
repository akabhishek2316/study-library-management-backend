import mongoose from 'mongoose'

const seatSchema = new mongoose.Schema(
  {
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hall',
      required: true,
    },

    number: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        'active',
        'maintenance',
      ],
      default: 'active',
    },

    position: {
      x: {
        type: Number,
        default: 0,
      },

      y: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
)

seatSchema.index(
  {
    hall: 1,
    number: 1,
  },
  {
    unique: true,
  }
)

export default mongoose.model(
  'Seat',
  seatSchema
)