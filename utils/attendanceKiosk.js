import crypto from 'crypto'

export function createAttendanceKioskToken() {
    return crypto.randomBytes(32).toString('hex')
}

export function hashAttendanceKioskToken(token) {
    return crypto
        .createHash('sha256')
        .update(String(token))
        .digest('hex')
}

export function createAttendanceActivationCode() {
    return String(
        crypto.randomInt(100000, 1000000)
    )
}

export function hashAttendanceActivationCode(code) {
    return crypto
        .createHash('sha256')
        .update(String(code))
        .digest('hex')
}