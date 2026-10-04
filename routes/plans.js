import { Router } from 'express'

import Plan from '../models/Plan.js'

import { protect, allow } from '../middleware/auth.js'

import { bad, PERIOD_MONTHS } from '../utils/dates.js'

// durationDays is only typed in for custom plans; the other periods fill it in (about 30 days per month)
const lengthOf = (period = 'custom', durationDays) => {
  if (PERIOD_MONTHS[period]) {
    return PERIOD_MONTHS[period] * 30
  }

  if (period !== 'custom') {
    throw bad(
      400,
      'Choose monthly, quarterly, half-yearly or custom'
    )
  }

  if (!(Number(durationDays) >= 1)) {
    throw bad(
      400,
      'Enter the number of days for a custom plan'
    )
  }

  return Math.round(Number(durationDays))
}

const router = Router()

router.use(protect)

router.get('/', async (req, res) => {
  const filter =
    req.query.all === '1'
      ? {}
      : { active: true }

  res.json(
    await Plan.find(filter)
      .populate('shift')
      .sort({ price: 1 })
  )
})

router.post('/', allow('owner'), async (req, res) => {
  const {
    name,
    period = 'custom',
    durationDays,
    shift,
    price,
  } = req.body

  res.status(201).json(
    await Plan.create({
      name,
      period,
      durationDays: lengthOf(period, durationDays),
      shift,
      price,
    })
  )
})

router.put('/:id', allow('owner'), async (req, res) => {
  const {
    name,
    period,
    durationDays,
    shift,
    price,
    active,
  } = req.body

  const patch = {
    name,
    shift,
    price,
    active,
  }

  if (period !== undefined) {
    patch.period = period
    patch.durationDays = lengthOf(period, durationDays)
  }

  const plan = await Plan.findByIdAndUpdate(
    req.params.id,
    patch,
    {
      new: true,
      runValidators: true,
    }
  )

  if (!plan) throw bad(404, 'Plan not found')

  res.json(plan)
})

// Plans are only switched off, never deleted, so old memberships keep their history.
router.delete('/:id', allow('owner'), async (req, res) => {
  await Plan.findByIdAndUpdate(
    req.params.id,
    { active: false }
  )

  res.json({
    message: 'Plan deactivated',
  })
})

export default router