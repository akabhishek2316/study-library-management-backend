import mongoose from 'mongoose'

export async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    family: 4,
    serverSelectionTimeoutMS: 15000,
  })

  console.log('MongoDB connected successfully')
}