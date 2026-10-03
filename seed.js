import 'dotenv/config'
import mongoose from 'mongoose'
import User from './models/User.js'
import Seat from './models/Seat.js'
import Shift from './models/Shift.js'
import Plan from './models/Plan.js'

await mongoose.connect(process.env.MONGO_URI)

// 1) Owner account
const email = (
  process.env.OWNER_EMAIL || 'owner@example.com'
).toLowerCase()

if (!(await User.findOne({ email }))) {
  await User.create({
    name: process.env.OWNER_NAME || 'Library Owner',
    email,
    password: process.env.OWNER_PASSWORD || 'ChangeMe123',
    role: 'owner',
  })

  console.log('Owner created:', email)
}

// 2) Sample shifts (edit in the app later)
const shiftData = [
  {
    name: 'Morning',
    startTime: '06:00',
    endTime: '14:00',
  },
  {
    name: 'Evening',
    startTime: '14:00',
    endTime: '22:00',
  },
  {
    name: 'Full Day',
    startTime: '06:00',
    endTime: '22:00',
  },
]

const shifts = {}

for (const s of shiftData) {
  shifts[s.name] =
    (await Shift.findOne({ name: s.name })) ||
    (await Shift.create(s))
}

// 3) Sample plans. These prices are placeholders: change them in the Plans screen.
if ((await Plan.countDocuments()) === 0) {
  await Plan.insertMany([
    {
      name: 'Morning Monthly',
      durationDays: 30,
      shift: shifts['Morning']._id,
      price: 600,
    },
    {
      name: 'Evening Monthly',
      durationDays: 30,
      shift: shifts['Evening']._id,
      price: 600,
    },
    {
      name: 'Full Day Monthly',
      durationDays: 30,
      shift: shifts['Full Day']._id,
      price: 1000,
    },
  ])
}

// 4) 20 sample seats
if ((await Seat.countDocuments()) === 0) {
  await Seat.insertMany(
    Array.from({ length: 20 }, (_, i) => ({
      number: `S${i + 1}`,
      section: 'Main Hall',
    }))
  )
}

console.log('Seed finished')

await mongoose.disconnect()