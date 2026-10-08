import crypto from 'crypto'
import AttendanceKiosk from '../models/AttendanceKiosk.js'

export async function attendanceKioskAuth(
    req,
    res,
    next
) {
    try {
        const token =
            req.headers['x-kiosk-token']

        if (!token) {
            return res.status(401).json({
                message:
                    'Attendance kiosk authentication required',
            })
        }

        const tokenHash =
            crypto
                .createHash('sha256')
                .update(String(token))
                .digest('hex')

        const kiosk =
            await AttendanceKiosk.findOne({
                tokenHash,
                active: true,
            })

        if (!kiosk) {
            return res.status(401).json({
                message:
                    'Invalid or disabled attendance kiosk',
            })
        }

        kiosk.lastUsedAt = new Date()
        await kiosk.save()

        req.attendanceKiosk = kiosk

        next()
    } catch (error) {
        next(error)
    }
}