import { Router } from 'express'

import Shift from '../models/Shift.js'
import Plan from '../models/Plan.js'

import { protect, allow } from '../middleware/auth.js'

import { bad } from '../utils/dates.js'

const router = Router()

router.use(protect)

router.get('/', async (req, res) =>
  res.json(
    await Shift.find().sort({ startTime: 1 })
  )
)

router.post('/', allow('owner'), async (req, res) => {
  const { name, startTime, endTime } = req.body

  if (startTime >= endTime) {
    throw bad(
      400,
      'End time must be after start time'
    )
  }

  res.status(201).json(
    await Shift.create({
      name,
      startTime,
      endTime
    })
  )
})

router.put('/:id', allow('owner'), async (req, res) => {
  const { name, startTime, endTime } = req.body

  if (startTime >= endTime) {
    throw bad(
      400,
      'End time must be after start time'
    )
  }

  const shift = await Shift.findByIdAndUpdate(
    req.params.id,
    {
      name,
      startTime,
      endTime
    },
    {
      new: true,
      runValidators: true
    }
  )

  if (!shift) {
    throw bad(404, 'Shift not found')
  }

  res.json(shift)
})

router.delete('/:id', allow('owner'), async (req, res) => {
  if (await Plan.exists({ shift: req.params.id })) {
    throw bad(
      400,
      'Delete or change the plans that use this shift first'
    )
  }

  await Shift.findByIdAndDelete(req.params.id)

  res.json({
    message: 'Shift deleted'
  })
})

export default router