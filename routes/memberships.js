import { Router } from 'express'

import Membership from '../models/Membership.js'
import Plan from '../models/Plan.js'
import Seat from '../models/Seat.js'
import Hall from '../models/Hall.js'
import User from '../models/User.js'

import { protect, allow } from '../middleware/auth.js'
import { findConflict } from '../utils/conflicts.js'
import { withDues } from '../utils/payments.js'
import { notify } from '../utils/notify.js'
import {
  bad,
  toDay,
  addDays,
  todayDate,
  planEndDate,
} from '../utils/dates.js'

const router = Router()

router.use(protect)

const d10 = (d) =>
  d.toISOString().slice(0, 10)

const tell = (
  m,
  title,
  message
) =>
  notify(m.student._id, {
    type: 'membership',
    title,
    message,
    link: '/student',
  })

const populate = (q) =>
  q
    .populate(
      'student',
      'name phone email'
    )
    .populate(
      'hall',
      'name type description'
    )
    .populate(
      'seat',
      'number hall section'
    )
    .populate(
      'plan',
      'name durationDays'
    )
    .populate(
      'shift',
      'name startTime endTime'
    )

// Shared by "assign seat" and "renew":
// validates everything, checks conflicts,
// creates the membership
async function createMembership({
  studentId,
  planId,
  seatId,
  startDate,
}) {
  const [
    student,
    plan,
    seat,
  ] = await Promise.all([
    User.findOne({
      _id: studentId,
      role: 'student',
      status: 'active',
    }),

    Plan.findById(
      planId
    ).populate('shift'),

    Seat.findById(
      seatId
    ),
  ])

  if (!student) {
    throw bad(
      404,
      'Active student not found'
    )
  }

  if (
    !plan ||
    !plan.active
  ) {
    throw bad(
      404,
      'Plan not found or inactive'
    )
  }

  if (!seat) {
    throw bad(
      404,
      'Seat not found'
    )
  }

  if (
    seat.status !== 'active'
  ) {
    throw bad(
      400,
      'This seat is under maintenance'
    )
  }

  const hall =
    await Hall.findOne({
      _id: seat.hall,
      active: true,
    })

  if (!hall) {
    throw bad(
      400,
      'The hall assigned to this seat is not available'
    )
  }

  const start =
    toDay(startDate)

  if (isNaN(start)) {
    throw bad(
      400,
      'Invalid start date'
    )
  }

  const end =
    planEndDate(
      plan,
      start
    )

  const conflict =
    await findConflict({
      seatId: seat._id,
      studentId: student._id,
      shift: plan.shift,
      startDate: start,
      endDate: end,
    })

  if (conflict) {
    throw bad(
      409,
      conflict
    )
  }

  const m =
    await Membership.create({
      student:
        student._id,

      plan:
        plan._id,

      hall:
        hall._id,

      seat:
        seat._id,

      shift:
        plan.shift._id,

      startDate:
        start,

      endDate:
        end,

      amount:
        plan.price,
    })

  return populate(
    Membership.findById(
      m._id
    )
  )
}

// Admin list.
// view = active | expiring | upcoming |
// expired | cancelled | all
router.get(
  '/',
  allow(
    'owner',
    'staff'
  ),
  async (
    req,
    res
  ) => {
    const today =
      todayDate()

    const {
      view = 'active',
      student,
    } = req.query

    const q = {}

    if (student) {
      q.student = student
    }

    if (
      view === 'active'
    ) {
      Object.assign(q, {
        status: {
          $in: [
            'active',
            'paused',
          ],
        },

        startDate: {
          $lte: today,
        },

        endDate: {
          $gte: today,
        },
      })
    } else if (
      view === 'expiring'
    ) {
      Object.assign(q, {
        status: 'active',

        startDate: {
          $lte: today,
        },

        endDate: {
          $gte: today,
          $lte: addDays(
            today,
            7
          ),
        },
      })
    } else if (
      view === 'upcoming'
    ) {
      Object.assign(q, {
        status: 'active',

        startDate: {
          $gt: today,
        },
      })
    } else if (
      view === 'expired'
    ) {
      Object.assign(q, {
        status: {
          $in: [
            'active',
            'paused',
          ],
        },

        endDate: {
          $lt: today,
        },
      })
    } else if (
      view === 'cancelled'
    ) {
      q.status =
        'cancelled'
    }

    res.json(
      await withDues(
        await populate(
          Membership.find(q)
            .sort({
              endDate: 1,
            })
            .limit(300)
        )
      )
    )
  }
)

// Student: own memberships
router.get(
  '/mine',
  async (
    req,
    res
  ) => {
    const items =
      await withDues(
        await populate(
          Membership.find({
            student:
              req.user._id,
          }).sort({
            startDate: -1,
          })
        ).lean()
      )

    const today =
      todayDate()

    const current =
      items.find(
        (m) =>
          m.status !==
            'cancelled' &&
          m.startDate <=
            today &&
          m.endDate >=
            today
      ) || null

    res.json({
      current,
      history: items,
    })
  }
)

router.post(
  '/',
  allow(
    'owner',
    'staff'
  ),
  async (
    req,
    res
  ) => {
    const {
      studentId,
      planId,
      seatId,
      startDate,
    } = req.body

    const created =
      await createMembership({
        studentId,
        planId,
        seatId,
        startDate,
      })

    tell(
      created,
      'Seat assigned',
      `${created.hall.name} - Seat ${created.seat.number} - ${created.plan.name}, ${d10(
        created.startDate
      )} to ${d10(
        created.endDate
      )}.`
    )

    res.status(201).json(
      created
    )
  }
)

// Renew: same seat,
// starts the day after the old one ends
// (or on a date you choose)
router.post(
  '/:id/renew',
  allow(
    'owner',
    'staff'
  ),
  async (
    req,
    res
  ) => {
    const old =
      await Membership.findById(
        req.params.id
      )

    if (!old) {
      throw bad(
        404,
        'Membership not found'
      )
    }

    const startDate =
      req.body.startDate ||
      addDays(
        old.endDate,
        1
      )

    const renewed =
      await createMembership({
        studentId:
          old.student,

        planId:
          req.body.planId ||
          old.plan,

        seatId:
          old.seat,

        startDate,
      })

    tell(
      renewed,
      'Plan renewed',
      `Your ${renewed.plan.name} is renewed: ${renewed.hall.name} - Seat ${renewed.seat.number}, ${d10(
        renewed.startDate
      )} to ${d10(
        renewed.endDate
      )}.`
    )

    res.status(201).json(
      renewed
    )
  }
)

// Pause / resume / cancel
router.patch(
  '/:id/status',
  allow(
    'owner',
    'staff'
  ),
  async (
    req,
    res
  ) => {
    const {
      status,
    } = req.body

    if (
      ![
        'active',
        'paused',
        'cancelled',
      ].includes(status)
    ) {
      throw bad(
        400,
        'Invalid status'
      )
    }

    const m =
      await Membership.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      )

    if (!m) {
      throw bad(
        404,
        'Membership not found'
      )
    }

    const updated =
      await populate(
        Membership.findById(
          m._id
        )
      )

    tell(
      updated,
      `Membership ${
        status ===
        'active'
          ? 'resumed'
          : status
      }`,
      `Your ${updated.hall.name} - Seat ${updated.seat.number} membership is now ${status}.`
    )

    res.json(
      updated
    )
  }
)

// Seat change
// (conflict-checked, ignoring the membership itself)
router.patch(
  '/:id/seat',
  allow(
    'owner',
    'staff'
  ),
  async (
    req,
    res
  ) => {
    const m =
      await Membership.findById(
        req.params.id
      ).populate(
        'shift'
      )

    if (!m) {
      throw bad(
        404,
        'Membership not found'
      )
    }

    const seat =
      await Seat.findById(
        req.body.seatId
      )

    if (
      !seat ||
      seat.status !==
        'active'
    ) {
      throw bad(
        400,
        'Choose a working seat'
      )
    }

    const hall =
      await Hall.findOne({
        _id: seat.hall,
        active: true,
      })

    if (!hall) {
      throw bad(
        400,
        'The hall assigned to this seat is not available'
      )
    }

    const conflict =
      await findConflict({
        seatId:
          seat._id,

        shift:
          m.shift,

        startDate:
          m.startDate,

        endDate:
          m.endDate,

        excludeId:
          m._id,
      })

    if (conflict) {
      throw bad(
        409,
        conflict
      )
    }

    m.hall =
      hall._id

    m.seat =
      seat._id

    await m.save()

    res.json(
      await populate(
        Membership.findById(
          m._id
        )
      )
    )
  }
)

export default router