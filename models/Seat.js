import mongoose from 'mongoose'

const seatSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    section: {
      type: String,
      default: 'Main Hall',
      trim: true
    },

    type: {
      type: String,
      enum: ['Non-AC', 'AC', 'Cabin'],
      default: 'Non-AC'
    },

    // "occupied" is NOT stored: it depends on date + shift, so it is computed from memberships.

    status: {
      type: String,
      enum: ['active', 'maintenance'],
      default: 'active'
    },

    position: {
      x: Number,
      y: Number
    }
  },
  { timestamps: true }
)

export default mongoose.model('Seat', seatSchema)