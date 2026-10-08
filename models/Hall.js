import mongoose from 'mongoose'

const hallSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    type: {
      type: String,
      enum: [
        'AC',
        'Non-AC',
        'Cabin',
      ],
      default: 'Non-AC',
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    capacity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model(
  'Hall',
  hallSchema
)