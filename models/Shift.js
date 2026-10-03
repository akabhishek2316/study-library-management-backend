import mongoose from 'mongoose'

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/

const shiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    startTime: {
      type: String,
      required: true,
      match: hhmm
    }, // "06:00"

    endTime: {
      type: String,
      required: true,
      match: hhmm
    } // "14:00"
  },
  { timestamps: true }
)

export default mongoose.model('Shift', shiftSchema)