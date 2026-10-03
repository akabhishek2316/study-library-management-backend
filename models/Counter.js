import mongoose from 'mongoose'

// Simple counter used for receipt numbers (one document per year)
const counterSchema = new mongoose.Schema(
    {
        _id: String,
        seq: { type: Number, default: 0 }
    }
)

export default mongoose.model('Counter', counterSchema)
