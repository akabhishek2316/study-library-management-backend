import 'dotenv/config'
import mongoose from 'mongoose'

import User from './models/User.js'
import Seat from './models/Seat.js'
import Shift from './models/Shift.js'
import Plan from './models/Plan.js'
import Hall from './models/Hall.js'


await mongoose.connect(
  process.env.MONGO_URI
)


console.log('MongoDB connected')


// ========================================
// 1) OWNER ACCOUNT
// ========================================

const email = (
  process.env.OWNER_EMAIL ||
  'owner@example.com'
).toLowerCase()


let owner =
  await User.findOne({
    email,
  })


if (!owner) {
  // never create a production owner with the public default password
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.OWNER_PASSWORD
  ) {
    console.error('Set OWNER_PASSWORD before seeding in production.')
    process.exit(1)
  }

  owner =
    await User.create({
      name:
        process.env.OWNER_NAME ||
        'Library Owner',

      email,

      phone:
        process.env.OWNER_PHONE ||
        '7894561230',

      password:
        process.env.OWNER_PASSWORD ||
        'ChangeMe123',

      role:
        'owner',
    })

  console.log(
    'Owner created:',
    email
  )
} else {
  console.log(
    'Owner already exists:',
    email
  )
}


// ========================================
// 2) SHIFTS
// ========================================

const shiftData = [
  {
    name:
      'Morning',

    startTime:
      '06:00',

    endTime:
      '14:00',
  },

  {
    name:
      'Evening',

    startTime:
      '14:00',

    endTime:
      '22:00',
  },

  {
    name:
      'Full Day',

    startTime:
      '06:00',

    endTime:
      '22:00',
  },
]


const shifts = {}


for (
  const item of shiftData
) {
  let shift =
    await Shift.findOne({
      name:
        item.name,
    })


  if (!shift) {
    shift =
      await Shift.create(
        item
      )

    console.log(
      'Shift created:',
      item.name
    )
  }


  shifts[
    item.name
  ] = shift
}


// ========================================
// 3) PLANS
// ========================================


// Monthly plans

const monthlyPlans = [
  {
    name:
      'Morning Monthly',

    period:
      'monthly',

    durationDays:
      30,

    shift:
      'Morning',

    price:
      600,
  },

  {
    name:
      'Evening Monthly',

    period:
      'monthly',

    durationDays:
      30,

    shift:
      'Evening',

    price:
      600,
  },

  {
    name:
      'Full Day Monthly',

    period:
      'monthly',

    durationDays:
      30,

    shift:
      'Full Day',

    price:
      1000,
  },
]


for (
  const item of monthlyPlans
) {
  const exists =
    await Plan.findOne({
      name:
        item.name,
    })


  if (!exists) {
    await Plan.create({
      name:
        item.name,

      period:
        item.period,

      durationDays:
        item.durationDays,

      shift:
        shifts[
          item.shift
        ]._id,

      price:
        item.price,
    })


    console.log(
      'Plan created:',
      item.name
    )
  }
}


// Quarterly plans

const quarterlyPlans = [
  {
    name:
      'Morning Quarterly',

    period:
      'quarterly',

    durationDays:
      90,

    shift:
      'Morning',

    price:
      1650,
  },

  {
    name:
      'Evening Quarterly',

    period:
      'quarterly',

    durationDays:
      90,

    shift:
      'Evening',

    price:
      1650,
  },

  {
    name:
      'Full Day Quarterly',

    period:
      'quarterly',

    durationDays:
      90,

    shift:
      'Full Day',

    price:
      2700,
  },
]


for (
  const item of quarterlyPlans
) {
  const exists =
    await Plan.findOne({
      name:
        item.name,
    })


  if (!exists) {
    await Plan.create({
      name:
        item.name,

      period:
        item.period,

      durationDays:
        item.durationDays,

      shift:
        shifts[
          item.shift
        ]._id,

      price:
        item.price,
    })


    console.log(
      'Plan created:',
      item.name
    )
  }
}


// ========================================
// 4) HALLS
// ========================================

const hallData = [
  {
    name:
      'Main AC Hall',

    type:
      'AC',

    description:
      'Air conditioned main reading hall',

    seatCount:
      20,
  },

  {
    name:
      'Main Non-AC Hall',

    type:
      'Non-AC',

    description:
      'Standard non-AC reading hall',

    seatCount:
      20,
  },

  {
    name:
      'Private Cabin Hall',

    type:
      'Cabin',

    description:
      'Private cabin reading area',

    seatCount:
      10,
  },
]


for (
  const item of hallData
) {
  let hall =
    await Hall.findOne({
      name:
        item.name,
    })


  if (!hall) {
    hall =
      await Hall.create({
        name:
          item.name,

        type:
          item.type,

        description:
          item.description,

        capacity:
          item.seatCount,

        active:
          true,
      })


    console.log(
      'Hall created:',
      item.name
    )
  } else {
    console.log(
      'Hall already exists:',
      item.name
    )
  }


  // ======================================
  // 5) SEATS FOR THIS HALL
  // ======================================

  const existingSeatCount =
    await Seat.countDocuments({
      hall:
        hall._id,
    })


  if (
    existingSeatCount === 0
  ) {
    const seats =
      Array.from(
        {
          length:
            item.seatCount,
        },
        (_, index) => ({
          hall:
            hall._id,

          number:
            `S${index + 1}`,

          status:
            'active',

          position: {
            x:
              0,

            y:
              0,
          },
        })
      )


    await Seat.insertMany(
      seats
    )


    console.log(
      `${item.seatCount} seats created for ${item.name}`
    )
  } else {
    console.log(
      `${existingSeatCount} seats already exist in ${item.name}`
    )
  }


  // Keep Hall capacity synchronized
  const actualSeatCount =
    await Seat.countDocuments({
      hall:
        hall._id,
    })


  if (
    hall.capacity !==
    actualSeatCount
  ) {
    hall.capacity =
      actualSeatCount

    await hall.save()


    console.log(
      `Hall capacity updated: ${item.name} → ${actualSeatCount}`
    )
  }
}


// ========================================
// 6) FINAL SUMMARY
// ========================================

console.log('')
console.log(
  '========================================'
)

console.log(
  'Seed finished successfully'
)

console.log(
  '========================================'
)

console.log('')


// Show halls

const finalHalls =
  await Hall.find({})
    .sort({
      name:
        1,
    })
    .lean()


for (
  const hall of finalHalls
) {
  const count =
    await Seat.countDocuments({
      hall:
        hall._id,
    })


  console.log(
    `${hall.name} | ${hall.type} | Seats: ${count}`
  )
}


console.log('')


await mongoose.disconnect()

console.log(
  'MongoDB disconnected'
)