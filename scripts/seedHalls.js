import 'dotenv/config'
import mongoose from 'mongoose'

import Hall from '../models/Hall.js'
import Seat from '../models/Seat.js'

const halls = [
  {
    name: 'Main Hall',
    type: 'Main Hall',
    description: 'Main study hall',
    capacity: 18,
  },
  {
    name: 'AC Hall',
    type: 'AC Hall',
    description: 'Air-conditioned study hall',
    capacity: 7,
  },
  {
    name: 'Silent Hall',
    type: 'Silent Hall',
    description: 'Silent study hall',
    capacity: 3,
  },
]

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI)

    console.log('MongoDB connected')

    for (const hallData of halls) {
      const hall = await Hall.findOneAndUpdate(
        { name: hallData.name },
        {
          $set: {
            type: hallData.type,
            description: hallData.description,
            capacity: hallData.capacity,
            active: true,
          },
        },
        {
          returnDocument: 'after',
          upsert: true,
          setDefaultsOnInsert: true,
        }
      )

      console.log(
        `Hall ready: ${hall.name} (${hall._id})`
      )

      for (let i = 1; i <= hall.capacity; i++) {
        await Seat.findOneAndUpdate(
          {
            hall: hall._id,
            number: String(i),
          },
          {
            $setOnInsert: {
              hall: hall._id,
              number: String(i),
              section: hall.name,
              status: 'active',
            },
          },
          {
            upsert: true,
            setDefaultsOnInsert: true,
          }
        )
      }

      console.log(
        `Seats ready: ${hall.capacity} for ${hall.name}`
      )
    }

    console.log('Hall + Seat setup completed.')
    process.exit(0)
  } catch (error) {
    console.error('Hall seed failed:', error)
    process.exit(1)
  }
}

run()