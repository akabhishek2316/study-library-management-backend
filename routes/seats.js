import { Router } from 'express'
import mongoose from 'mongoose'

import Seat from '../models/Seat.js'
import Shift from '../models/Shift.js'
import Membership from '../models/Membership.js'
import Hall from '../models/Hall.js'

import {
  protect,
  allow,
} from '../middleware/auth.js'

import {
  bad,
  toDay,
  todayDate,
  timesOverlap,
} from '../utils/dates.js'

const router = Router()

router.use(protect)

const sorted = () =>
  Seat.find()
    .populate(
      'hall',
      'name type description capacity'
    )
    .collation({
      locale: 'en',
      numericOrdering: true,
    })
    .sort({
      hall: 1,
      number: 1,
    })


// --------------------------------------------------
// GET ALL SEATS
// --------------------------------------------------

router.get(
  '/',
  async (req, res) => {
    res.json(
      await sorted()
    )
  }
)


// --------------------------------------------------
// SEAT MAP
// --------------------------------------------------

router.get(
  '/map',
  allow(
    'owner',
    'staff',
    'student'
  ),
  async (req, res) => {
    const shiftId =
      String(
        req.query.shift || ''
      ).trim()

    if (
      !shiftId ||
      !mongoose.isValidObjectId(
        shiftId
      )
    ) {
      throw bad(
        400,
        'Invalid shift id'
      )
    }

    const shift =
      await Shift.findById(
        shiftId
      )

    if (!shift) {
      throw bad(
        404,
        'Shift not found'
      )
    }

    const day = req.query.date
      ? toDay(req.query.date)
      : todayDate()

    if (isNaN(day)) {
      throw bad(
        400,
        'Invalid date'
      )
    }

    const [
      seats,
      memberships,
    ] = await Promise.all([
      sorted().lean(),

      Membership.find({
        status: {
          $in: [
            'active',
            'paused',
          ],
        },

        startDate: {
          $lte: day,
        },

        endDate: {
          $gte: day,
        },
      })
        .populate('shift')
        .populate(
          'student',
          'name phone'
        )
        .lean(),
    ])

    const booked =
      new Map(
        memberships
          .filter(
            (membership) =>
              membership.shift &&
              timesOverlap(
                membership.shift,
                shift
              )
          )
          .map(
            (membership) => [
              String(
                membership.seat
              ),
              membership,
            ]
          )
      )

    res.json({
      date: day,

      seats: seats.map(
        (seat) => {
          const membership =
            booked.get(
              String(
                seat._id
              )
            )

          const state =
            seat.status ===
            'maintenance'
              ? 'maintenance'
              : membership
                ? 'occupied'
                : 'available'

          return {
            ...seat,

            state,

            occupant:
              membership &&
              membership.student
                ? {
                    name:
                      membership
                        .student
                        .name,

                    phone:
                      membership
                        .student
                        .phone,

                    endDate:
                      membership.endDate,

                    membershipId:
                      membership._id,
                  }
                : null,
          }
        }
      ),
    })
  }
)


// --------------------------------------------------
// ACTIVE HALLS
// --------------------------------------------------

router.get(
  '/halls',
  allow(
    'owner',
    'staff'
  ),
  async (req, res) => {
    const halls =
      await Hall.find({
        active: true,
      }).sort({
        name: 1,
      })

    res.json(halls)
  }
)


// --------------------------------------------------
// CREATE SINGLE SEAT
// --------------------------------------------------

router.post(
  '/',
  allow('owner'),
  async (req, res) => {
    const {
      hall,
      number,
      position,
    } = req.body

    if (!hall) {
      throw bad(
        400,
        'Please select a hall'
      )
    }

    if (!number?.trim()) {
      throw bad(
        400,
        'Seat number is required'
      )
    }

    const selectedHall =
      await Hall.findOne({
        _id: hall,
        active: true,
      })

    if (!selectedHall) {
      throw bad(
        404,
        'Selected hall not found'
      )
    }

    const cleanNumber =
      number.trim()

    const existing =
      await Seat.findOne({
        hall:
          selectedHall._id,

        number:
          cleanNumber,
      })

    if (existing) {
      throw bad(
        409,
        `Seat ${cleanNumber} already exists in ${selectedHall.name}`
      )
    }

    const seat =
      await Seat.create({
        hall:
          selectedHall._id,

        number:
          cleanNumber,

        position,
      })

    selectedHall.capacity += 1

    await selectedHall.save()

    const created =
      await Seat.findById(
        seat._id
      ).populate(
        'hall',
        'name type description capacity'
      )

    res.status(201).json(
      created
    )
  }
)


// --------------------------------------------------
// BULK CREATE SEATS
// --------------------------------------------------

router.post(
  '/bulk',
  allow('owner'),
  async (req, res) => {
    const {
      hallMode = 'existing',

      hall,

      hallName,

      hallType =
        'Non-AC',

      hallDescription =
        '',

      prefix = 'S',

      startNumber,

      quantity,
    } = req.body

    const count =
      Number(quantity)

    const start =
      Number(startNumber)

    if (
      !Number.isInteger(
        count
      ) ||
      count < 1 ||
      count > 200
    ) {
      throw bad(
        400,
        'Number of seats must be between 1 and 200'
      )
    }

    if (
      !Number.isInteger(
        start
      ) ||
      start < 1
    ) {
      throw bad(
        400,
        'Starting number must be a positive number'
      )
    }

    const cleanPrefix =
      String(
        prefix || ''
      ).trim()

    if (!cleanPrefix) {
      throw bad(
        400,
        'Seat prefix is required'
      )
    }

    let selectedHall
    let createdNewHall = false

    // ----------------------------------------------
    // EXISTING HALL
    // ----------------------------------------------

    if (
      hallMode ===
      'existing'
    ) {
      if (!hall) {
        throw bad(
          400,
          'Please select a hall'
        )
      }

      selectedHall =
        await Hall.findOne({
          _id: hall,
          active: true,
        })

      if (!selectedHall) {
        throw bad(
          404,
          'Selected hall not found'
        )
      }
    }

    // ----------------------------------------------
    // NEW HALL
    // ----------------------------------------------

    else if (
      hallMode ===
      'new'
    ) {
      const cleanHallName =
        String(
          hallName || ''
        ).trim()

      if (!cleanHallName) {
        throw bad(
          400,
          'Hall name is required'
        )
      }

      const allowedHallTypes = [
        'AC',
        'Non-AC',
        'Cabin',
      ]

      if (
        !allowedHallTypes.includes(
          hallType
        )
      ) {
        throw bad(
          400,
          'Hall type must be AC, Non-AC or Cabin'
        )
      }

      const existingHall =
        await Hall.findOne({
          name:
            cleanHallName,
        })

      if (existingHall) {
        throw bad(
          409,
          'A hall with this name already exists'
        )
      }

      selectedHall =
        await Hall.create({
          name:
            cleanHallName,

          type:
            hallType,

          description:
            String(
              hallDescription || ''
            ).trim(),

          capacity:
            count,

          active: true,
        })

      createdNewHall = true
    }

    else {
      throw bad(
        400,
        'Invalid hall mode'
      )
    }

    // ----------------------------------------------
    // GENERATE SEAT NUMBERS
    // ----------------------------------------------

    const seatNumbers =
      Array.from(
        {
          length: count,
        },
        (_, index) =>
          `${cleanPrefix}${
            start + index
          }`
      )

    // ----------------------------------------------
    // DUPLICATE CHECK
    // ----------------------------------------------

    const existingSeats =
      await Seat.find({
        hall:
          selectedHall._id,

        number: {
          $in:
            seatNumbers,
        },
      }).select(
        'number'
      )

    if (
      existingSeats.length
    ) {
      const duplicateNames =
        existingSeats.map(
          (seat) =>
            seat.number
        )

      if (createdNewHall) {
        await Hall.findByIdAndDelete(
          selectedHall._id
        )
      }

      throw bad(
        409,
        `These seats already exist: ${duplicateNames.join(', ')}`
      )
    }

    // ----------------------------------------------
    // CREATE SEATS
    // ----------------------------------------------

    const seats =
      seatNumbers.map(
        (number) => ({
          hall:
            selectedHall._id,

          number,

          status:
            'active',
        })
      )

    await Seat.insertMany(
      seats
    )

    // Existing hall capacity
    if (
      !createdNewHall
    ) {
      selectedHall.capacity +=
        count

      await selectedHall.save()
    }

    // ----------------------------------------------
    // RESPONSE
    // ----------------------------------------------

    const created =
      await Seat.find({
        hall:
          selectedHall._id,

        number: {
          $in:
            seatNumbers,
        },
      })
        .populate(
          'hall',
          'name type description capacity'
        )
        .collation({
          locale: 'en',
          numericOrdering: true,
        })
        .sort({
          number: 1,
        })

    const freshHall =
      await Hall.findById(
        selectedHall._id
      )

    res.status(201).json({
      hall:
        freshHall,

      seats:
        created,

      count:
        created.length,
    })
  }
)


// --------------------------------------------------
// SAVE FLOOR PLAN
// --------------------------------------------------

router.put(
  '/layout',
  allow('owner'),
  async (req, res) => {
    const list =
      Array.isArray(
        req.body.positions
      )
        ? req.body.positions
        : []

    const ops =
      list
        .filter(
          (item) =>
            item.id &&
            Number.isFinite(
              Number(item.x)
            ) &&
            Number.isFinite(
              Number(item.y)
            )
        )
        .map(
          (item) => ({
            updateOne: {
              filter: {
                _id:
                  item.id,
              },

              update: {
                $set: {
                  position: {
                    x: Number(
                      item.x
                    ),

                    y: Number(
                      item.y
                    ),
                  },
                },
              },
            },
          })
        )

    if (ops.length) {
      await Seat.bulkWrite(
        ops
      )
    }

    res.json({
      saved:
        ops.length,
    })
  }
)


// --------------------------------------------------
// UPDATE SEAT
// --------------------------------------------------

router.put(
  '/:id',
  allow('owner'),
  async (req, res) => {
    const {
      number,
      status,
      position,
    } = req.body

    const existingSeat =
      await Seat.findById(
        req.params.id
      )

    if (!existingSeat) {
      throw bad(
        404,
        'Seat not found'
      )
    }

    if (
      number !== undefined
    ) {
      const cleanNumber =
        String(
          number
        ).trim()

      if (!cleanNumber) {
        throw bad(
          400,
          'Seat number is required'
        )
      }

      const duplicate =
        await Seat.findOne({
          _id: {
            $ne:
              existingSeat._id,
          },

          hall:
            existingSeat.hall,

          number:
            cleanNumber,
        })

      if (duplicate) {
        throw bad(
          409,
          `Seat ${cleanNumber} already exists in this hall`
        )
      }

      existingSeat.number =
        cleanNumber
    }

    if (status) {
      if (
        ![
          'active',
          'maintenance',
        ].includes(status)
      ) {
        throw bad(
          400,
          'Invalid seat status'
        )
      }

      existingSeat.status =
        status
    }

    if (position) {
      existingSeat.position =
        position
    }

    await existingSeat.save()

    const updated =
      await Seat.findById(
        existingSeat._id
      ).populate(
        'hall',
        'name type description capacity'
      )

    res.json(
      updated
    )
  }
)


// --------------------------------------------------
// DELETE SEAT
// --------------------------------------------------

router.delete(
  '/:id',
  allow('owner'),
  async (req, res) => {
    const seat =
      await Seat.findById(
        req.params.id
      )

    if (!seat) {
      throw bad(
        404,
        'Seat not found'
      )
    }

    const inUse =
      await Membership.exists({
        seat:
          req.params.id,

        status: {
          $in: [
            'active',
            'paused',
          ],
        },

        endDate: {
          $gte:
            todayDate(),
        },
      })

    if (inUse) {
      throw bad(
        400,
        'Seat has active or upcoming memberships. Move those students first.'
      )
    }

    const hallId =
      seat.hall

    await Seat.findByIdAndDelete(
      req.params.id
    )

    if (hallId) {
      await Hall.findByIdAndUpdate(
        hallId,
        {
          $inc: {
            capacity: -1,
          },
        }
      )
    }

    res.json({
      message:
        'Seat deleted',
    })
  }
)

export default router