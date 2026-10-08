import mongoose from 'mongoose'

const attendanceKioskSchema =
    new mongoose.Schema(
        {
            name: {
                type: String,
                required: true,
                trim: true,
            },

            tokenHash: {
                type: String,
                default: null,
                unique: true,
                sparse: true,
            },

            activationHash: {
                type: String,
                default: null,
            },

            activationExpiresAt: {
                type: Date,
                default: null,
            },

            active: {
                type: Boolean,
                default: true,
            },

            lastUsedAt: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
        }
    )

export default mongoose.model(
    'AttendanceKiosk',
    attendanceKioskSchema
)