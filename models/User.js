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
      required: true,
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

    photo: {
      url: String,
      publicId: String
    },

    idProof: {
      url: String,
      publicId: String
    },

    idProofType: {
      type: String,
      enum: [
        'Aadhaar',
        'PAN',
        'Driving Licence',
        'Voter ID',
        'Other'
      ],
      trim: true
    },

    idProofNumber: {
      type: String,
      trim: true
    },

    dob: {
      type: Date
    },

    gender: {
      type: String,
      enum: [
        'Male',
        'Female',
        'Other',
        'Prefer not to say'
      ]
    },

    address: {
      type: String,
      trim: true
    },

    city: {
      type: String,
      trim: true
    },

    state: {
      type: String,
      trim: true
    },

    pincode: {
      type: String,
      trim: true
    },

    emergencyContact: {
      name: {
        type: String,
        trim: true
      },

      relationship: {
        type: String,
        trim: true
      },

      phone: {
        type: String,
        trim: true
      }
    },

    studentType: {
      type: String,
      enum: [
        'Student',
        'Working Professional'
      ]
    },

    institution: {
      type: String,
      trim: true
    },

    course: {
      type: String,
      trim: true
    },

    yearSemester: {
      type: String,
      trim: true
    },

    admissionStatus: {
      type: String,
      enum: [
        'pending',
        'approved',
        'rejected'
      ],
      default: 'pending'
    },

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
  {
    timestamps: true
  }
)

userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(
      this.password,
      10
    )
  }
})

userSchema.methods.matchPassword = function (
  plain
) {
  return bcrypt.compare(
    plain,
    this.password
  )
}

userSchema.methods.toSafe = function () {
  const o = this.toObject()

  delete o.password

  return o
}

export default mongoose.model(
  'User',
  userSchema
)