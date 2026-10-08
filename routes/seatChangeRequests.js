import { Router } from 'express'

import SeatChangeRequest from '../models/SeatChangeRequest.js'
import Membership from '../models/Membership.js'
import Seat from '../models/Seat.js'
import User from '../models/User.js'

import { protect, allow } from '../middleware/auth.js'

import { findConflict } from '../utils/conflicts.js'
import { bad, todayDate } from '../utils/dates.js'
import { notify } from '../utils/notify.js'

const router = Router()

router.use(protect)

const populateRequest = (q) =>
  q
    .populate(
      'student',
      'name phone email'
    )
    .populate(
      'membership',
      'startDate endDate status amount'
    )
    .populate({
      path: 'currentSeat',
      select:
        'number section type hall',
      populate: {
        path: 'hall',
        select:
          'name type description',
      },
    })
    .populate({
      path: 'requestedSeat',
      select:
        'number section type hall',
      populate: {
        path: 'hall',
        select:
          'name type description',
      },
    })

// Student: submit seat-change request
router.post(
  '/',
  allow('student'),
  async (req, res) => {
    const {
      membershipId,
      seatId,
      reason = '',
    } = req.body

    const membership =
      await Membership.findOne({
        _id: membershipId,
        student: req.user._id,
        status: 'active',
        startDate: {
          $lte: todayDate(),
        },
        endDate: {
          $gte: todayDate(),
        },
      }).populate('shift')

    if (!membership) {
      throw bad(
        404,
        'Active membership not found'
      )
    }

    const seat =
  await Seat.findById(
    seatId
  ).populate(
    'hall',
    'name type description active'
  )

if (
  !seat ||
  seat.status !== 'active'
) {
  throw bad(
    400,
    'Choose a working seat'
  )
}

if (
  !seat.hall ||
  seat.hall.active === false
) {
  throw bad(
    400,
    'Choose a seat from an active hall'
  )
}

    if (
      String(membership.seat) ===
      String(seat._id)
    ) {
      throw bad(
        400,
        'You are already using this seat'
      )
    }

    const existing =
      await SeatChangeRequest.findOne({
        student:
          req.user._id,
        membership:
          membership._id,
        status: 'pending',
      })

    if (existing) {
      throw bad(
        409,
        'You already have a pending seat change request'
      )
    }

    const conflict =
      await findConflict({
        seatId: seat._id,
        studentId:
          membership.student,
        shift:
          membership.shift,
        startDate:
          membership.startDate,
        endDate:
          membership.endDate,
        excludeId:
          membership._id,
      })

    if (conflict) {
      throw bad(
        409,
        conflict
      )
    }

    const request =
      await SeatChangeRequest.create({
        student:
          req.user._id,
        membership:
          membership._id,
        currentSeat:
          membership.seat,
        requestedSeat:
          seat._id,
        reason,
      })

    const admins =
      await User.find({
        role: {
          $in: [
            'owner',
            'staff',
          ],
        },
        status: 'active',
      }).select('_id')

    for (const admin of admins) {
      await notify(admin._id, {
        type: 'membership',
        title:
          'Seat Change Request',
        message:
          `${req.user.name} requested ${seat.hall?.name || 'Hall'} · Seat ${seat.number}.`,
        link:
          '/admin/seat-change-requests',
      })
    }

    res.status(201).json(
      await populateRequest(
        SeatChangeRequest.findById(
          request._id
        )
      )
    )
  }
)

// Student: own requests
router.get(
  '/mine',
  allow('student'),
  async (req, res) => {
    const requests =
      await populateRequest(
        SeatChangeRequest.find({
          student:
            req.user._id,
        }).sort({
          createdAt: -1,
        })
      )

    res.json(requests)
  }
)

// Admin: list requests
router.get(
  '/',
  allow('owner', 'staff'),
  async (req, res) => {
    const {
      status = 'pending',
    } = req.query

    const q = {}

    if (
      [
        'pending',
        'approved',
        'rejected',
        'all',
      ].includes(status) &&
      status !== 'all'
    ) {
      q.status = status
    }

    res.json(
      await populateRequest(
        SeatChangeRequest.find(q)
          .sort({
            createdAt: -1,
          })
          .limit(300)
      )
    )
  }
)

// Admin: approve/reject
router.patch(
  '/:id/status',
  allow('owner', 'staff'),
  async (req, res) => {
    const {
      status,
      message = '',
    } = req.body

    if (
      ![
        'approved',
        'rejected',
      ].includes(status)
    ) {
      throw bad(
        400,
        'Invalid request status'
      )
    }

    const request =
      await SeatChangeRequest.findById(
        req.params.id
      )

    if (!request) {
      throw bad(
        404,
        'Seat change request not found'
      )
    }

    if (
      request.status !== 'pending'
    ) {
      throw bad(
        400,
        'This request has already been reviewed'
      )
    }

    if (status === 'rejected') {
      request.status = 'rejected'
      request.reviewedBy =
        req.user._id
      request.reviewedAt =
        new Date()
      request.reviewMessage =
        message

      await request.save()

      await notify(
        request.student,
        {
          type: 'membership',
          title:
            'Seat Change Rejected',
          message:
            message ||
            'Your seat change request was rejected.',
          link: '/student',
        }
      )

      return res.json(
        await populateRequest(
          SeatChangeRequest.findById(
            request._id
          )
        )
      )
    }

    const membership =
      await Membership.findById(
        request.membership
      ).populate('shift')

    if (!membership) {
      throw bad(
        404,
        'Membership not found'
      )
    }

    if (
      membership.status !==
      'active'
    ) {
      throw bad(
        400,
        'Membership is no longer active'
      )
    }

    const seat =
      await Seat.findById(
        request.requestedSeat
      ).populate(
        'hall',
        'name type description active'
      )

    if (
      !seat ||
      seat.status !== 'active'
    ) {
      throw bad(
        400,
        'Requested seat is no longer available'
      )
    }

    if (
      !seat.hall ||
      !seat.hall.active
    ) {
      throw bad(
        400,
        'Requested seat hall is no longer available'
      )
    }

    const conflict =
      await findConflict({
        seatId: seat._id,
        studentId:
          membership.student,
        shift:
          membership.shift,
        startDate:
          membership.startDate,
        endDate:
          membership.endDate,
        excludeId:
          membership._id,
      })

    if (conflict) {
      throw bad(
        409,
        conflict
      )
    }

    const oldSeatId =
      membership.seat

    membership.seat =
      seat._id

    membership.hall =
      seat.hall._id

    await membership.save()

    // Keep the original seat only as request history.
    // The membership now points exclusively to the new hall and seat.
    request.currentSeat =
      oldSeatId

    request.requestedSeat =
      seat._id

    request.status =
      'approved'

    request.reviewedBy =
      req.user._id

    request.reviewedAt =
      new Date()

    request.reviewMessage =
      message

    await request.save()

    await notify(
      request.student,
      {
        type: 'membership',
        title:
          'Seat Change Approved',
        message:
          `Your seat has been changed to ${seat.hall?.name || 'Hall'} · Seat ${seat.number}.`,
        link: '/student',
      }
    )

    res.json(
      await populateRequest(
        SeatChangeRequest.findById(
          request._id
        )
      )
    )
  }
)

export default router