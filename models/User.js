import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    phone: {
      type: String,
      trim: true
    },

    password: {
      type: String,
      required: true,
      minlength: 6
    },

    role: {
      type: String,
      enum: ['owner', 'staff', 'student'],
      default: 'student'
    },

    photo: String,

    idProof: String,

    emergencyContact: String,

    joinDate: {
      type: Date,
      default: Date.now
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    }
  },
  { timestamps: true }
)

userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10)
  }
})

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password)
}

userSchema.methods.toSafe = function () {
  const o = this.toObject()

  delete o.password

  return o
}

export default mongoose.model('User', userSchema)