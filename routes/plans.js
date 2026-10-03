import { Router } from 'express'

import Plan from '../models/Plan.js'

import { protect, allow } from '../middleware/auth.js'

import { bad } from '../utils/dates.js'

const router = Router()

router.use(protect)

router.get('/', async (req, res) => {
  const filter = req.query.all === '1'
    ? {}
    : { active: true }

  res.json(
    await Plan.find(filter)
      .populate('shift')
      .sort({ price: 1 })
  )
})

router.post('/', allow('owner'), async (req, res) => {
  const { name, durationDays, shift, price } = req.body

  res.status(201).json(
    await Plan.create({
      name,
      durationDays,
      shift,
      price
    })
  )
})

router.put('/:id', allow('owner'), async (req, res) => {
  const { name, durationDays, shift, price, active } = req.body

  const plan = await Plan.findByIdAndUpdate(
    req.params.id,
    {
      name,
      durationDays,
      shift,
      price,
      active
    },
    {
      new: true,
      runValidators: true
    }
  )

  if (!plan) {
    throw bad(404, 'Plan not found')
  }

  res.json(plan)
})

// Plans are only switched off, never deleted, so old memberships keep their history.

router.delete('/:id', allow('owner'), async (req, res) => {
  await Plan.findByIdAndUpdate(
    req.params.id,
    { active: false }
  )

  res.json({
    message: 'Plan deactivated'
  })
})

export default router