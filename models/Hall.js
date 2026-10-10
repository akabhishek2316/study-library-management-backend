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

    // Floor plan decoration (rectangles, circles, text) and board height.
    // Saved here (not in the browser) so every device and every user sees the same plan.
    floor: {
      ratio: {
        type: Number,
        min: 0.3,
        max: 12,
      },

      // dense layouts: seat width as % of the board width (null = normal)
      seatPct: {
        type: Number,
        min: 2,
        max: 12,
        default: null,
      },

      objects: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },
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