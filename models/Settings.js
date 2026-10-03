import mongoose from 'mongoose'

// One document only. Anything left empty falls back to the .env value.
const settingsSchema = new mongoose.Schema(
  {
    libraryName: String,
    address: String,
    phone: String,
    closeTime: String,
    qrRotateSeconds: Number,
    remindDays: [Number],
    geoEnabled: Boolean,
    geoLat: Number,
    geoLng: Number,
    geoMeters: Number,
  },
  { timestamps: true }
)

export default mongoose.model('Settings', settingsSchema)
