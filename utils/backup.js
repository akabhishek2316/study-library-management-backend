import User from '../models/User.js'
import Seat from '../models/Seat.js'
import Shift from '../models/Shift.js'
import Plan from '../models/Plan.js'
import Membership from '../models/Membership.js'
import Payment from '../models/Payment.js'
import Counter from '../models/Counter.js'
import Attendance from '../models/Attendance.js'
import Notice from '../models/Notice.js'
import Feedback from '../models/Feedback.js'
import Settings from '../models/Settings.js'
import Hall from '../models/Hall.js'
import AdmissionRequest from '../models/AdmissionRequest.js'
import SeatChangeRequest from '../models/SeatChangeRequest.js'
import AttendanceKiosk from '../models/AttendanceKiosk.js'

// Everything that matters. (Notifications are left out: they are temporary.)

export const COLLECTIONS = {
  users: User,
  seats: Seat,
  shifts: Shift,
  plans: Plan,
  memberships: Membership,
  payments: Payment,
  counters: Counter,
  attendance: Attendance,
  notices: Notice,
  feedback: Feedback,
  settings: Settings,
  // these were missing: without halls a restore left every seat/membership pointing at nothing
  halls: Hall,
  admissionRequests: AdmissionRequest,
  seatChangeRequests: SeatChangeRequest,
  attendanceKiosks: AttendanceKiosk,
}

export async function makeBackup() {
  const collections = {}

  for (const [name, Model] of Object.entries(COLLECTIONS)) {
    collections[name] = await Model.find().lean()
  }

  return {
    app: 'study-library',
    version: 1,
    createdAt: new Date().toISOString(),
    collections
  }
}