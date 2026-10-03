import { Router } from 'express'

import Seat from '../models/Seat.js'
import Shift from '../models/Shift.js'
import Membership from '../models/Membership.js'

import { protect, allow } from '../middleware/auth.js'

import {
  bad,
  toDay,
  todayDate,
  timesOverlap
} from '../utils/dates.js'

const router = Router()

router.use(protect, allow('owner', 'staff'))

const sorted = () =>
  Seat.find()
    .collation({
      locale: 'en',
      numericOrdering: true
    })
    .sort({
      section: 1,
      number: 1
    })

router.get('/', async (req, res) =>
  res.json(await sorted())
)

// Seat map for one date + one shift: each seat is available / occupied / maintenance

router.get('/map', async (req, res) => {
  const shift = await Shift.findById(req.query.shift)

  if (!shift) {
    throw bad(400, 'Select a shift')
  }

  const day = req.query.date
    ? toDay(req.query.date)
    : todayDate()

  if (isNaN(day)) {
    throw bad(400, 'Invalid date')
  }

  const [seats, memberships] = await Promise.all([
    sorted().lean(),

    Membership.find({
      status: {
        $in: ['active', 'paused']
      },
      startDate: {
        $lte: day
      },
      endDate: {
        $gte: day
      }
    })
      .populate('shift')
      .populate('student', 'name phone')
      .lean()
  ])

  const booked = new Map(
    memberships
      .filter((m) => timesOverlap(m.shift, shift))
      .map((m) => [String(m.seat), m])
  )

  res.json({
    date: day,

    seats: seats.map((s) => {
      const m = booked.get(String(s._id))

      const state =
        s.status === 'maintenance'
          ? 'maintenance'
          : m
            ? 'occupied'
            : 'available'

      return {
        ...s,
        state,
        occupant: m
          ? {
              name: m.student.name,
              phone: m.student.phone,
              endDate: m.endDate,
              membershipId: m._id
            }
          : null
      }
    })
  })
})

router.post('/', allow('owner'), async (req, res) => {
  const {
    number,
    section,
    type,
    position
  } = req.body

  res.status(201).json(
    await Seat.create({
      number,
      section,
      type,
      position
    })
  )
})

// Save the floor-plan positions of many seats at once (x, y are percentages of the plan)

router.put('/layout', allow('owner'), async (req, res) => {
  const list = Array.isArray(req.body.positions)
    ? req.body.positions
    : []

  const ops = list
    .filter(
      (p) =>
        p.id &&
        Number.isFinite(Number(p.x)) &&
        Number.isFinite(Number(p.y))
    )
    .map((p) => ({
      updateOne: {
        filter: {
          _id: p.id
        },
        update: {
          $set: {
            position: {
              x: Number(p.x),
              y: Number(p.y)
            }
          }
        }
      }
    }))

  if (ops.length) {
    await Seat.bulkWrite(ops)
  }

  res.json({
    saved: ops.length
  })
})

router.put('/:id', allow('owner'), async (req, res) => {
  const {
    number,
    section,
    type,
    status,
    position
  } = req.body

  const seat = await Seat.findByIdAndUpdate(
    req.params.id,
    {
      number,
      section,
      type,
      status,
      position
    },
    {
      new: true,
      runValidators: true
    }
  )

  if (!seat) {
    throw bad(404, 'Seat not found')
  }

  res.json(seat)
})

router.delete('/:id', allow('owner'), async (req, res) => {
  const inUse = await Membership.exists({
    seat: req.params.id,
    status: {
      $in: ['active', 'paused']
    },
    endDate: {
      $gte: todayDate()
    }
  })

  if (inUse) {
    throw bad(
      400,
      'Seat has active or upcoming memberships. Move those students first.'
    )
  }

  await Seat.findByIdAndDelete(req.params.id)

  res.json({
    message: 'Seat deleted'
  })
})

export default router