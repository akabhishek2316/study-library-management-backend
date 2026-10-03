import mongoose from 'mongoose'

// One document = one visit (check-in to check-out). A student can have several visits in a day.

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // the library-timezone day, stored as UTC midnight (like memberships)
    date: {
      type: Date,
      required: true
    }, 
    checkIn: {
      type: Date,
      required: true
    },

    // null = still inside
    checkOut: {
      type: Date,
      default: null
    }, 

    method: {
      type: String,
      enum: ['qr', 'manual'],
      default: 'qr'
    },

    // closed automatically at closing time
    autoCheckOut: {
      type: Boolean,
      default: false
    } 
  },
  { timestamps: true }
)

attendanceSchema.index({ student: 1, date: 1 })
attendanceSchema.index({ date: 1 })
attendanceSchema.index({ student: 1, checkOut: 1 })

export default mongoose.model('Attendance', attendanceSchema)