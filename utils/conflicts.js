import Membership from '../models/Membership.js'

import { timesOverlap } from './dates.js'

const fmt = (d) => d.toISOString().slice(0, 10)

/**
 * Seat conflict rule (the heart of the app):
 * a seat can't be booked twice if the DATE ranges overlap
 * AND the SHIFT times overlap.
 *
 * Morning + Evening can share a seat; Full Day clashes with both.
 * A student also can't hold two overlapping shifts on the same dates.
 *
 * Returns an error message, or null when everything is free.
 */
export async function findConflict({
  seatId,
  studentId,
  shift,
  startDate,
  endDate,
  excludeId
}) {
  const base = {
    status: {
      $in: ['active', 'paused']
    }, // Paused memberships keep their seat.
    startDate: {
      $lte: endDate
    },
    endDate: {
      $gte: startDate
    }
  }

  if (excludeId) {
    base._id = {
      $ne: excludeId
    }
  }

  const onSeat = await Membership.find({
    ...base,
    seat: seatId
  })
    .populate('shift')
    .populate('student', 'name')

  const clash = onSeat.find(
    (m) => timesOverlap(m.shift, shift)
  )

  if (clash) {
    return `Seat is already booked by ${clash.student?.name} (${clash.shift.name}, ${fmt(clash.startDate)} to ${fmt(clash.endDate)})`
  }

  if (studentId) {
    const own = await Membership.find({
      ...base,
      student: studentId
    }).populate('shift')

    if (
      own.some((m) => timesOverlap(m.shift, shift))
    ) {
      return 'This student already has a membership for an overlapping shift in these dates'
    }
  }

  return null
}