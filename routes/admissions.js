import { Router } from 'express'

import AdmissionRequest from '../models/AdmissionRequest.js'
import User from '../models/User.js'
import Plan from '../models/Plan.js'
import Seat from '../models/Seat.js'
import Membership from '../models/Membership.js'
import Notification from '../models/Notification.js'

import {
  protect,
  allow,
} from '../middleware/auth.js'

import upload from '../middleware/upload.js'

import {
  bad,
  todayDate,
  planEndDate,
} from '../utils/dates.js'

import { findConflict } from '../utils/conflicts.js'

import {
  uploadBuffer,
} from '../utils/cloudinary.js'

const router = Router()

// Public: available seats for selected plan
router.get(
  '/available-seats',
  async (req, res) => {
    const { plan } = req.query

    if (!plan) {
      throw bad(
        400,
        'Plan is required'
      )
    }

    const selectedPlan =
      await Plan.findOne({
        _id: plan,
        active: true,
      }).populate('shift')

    if (!selectedPlan) {
      throw bad(
        400,
        'Selected plan is not available'
      )
    }

    const startDate = todayDate()

    const endDate = planEndDate(
      selectedPlan,
      startDate
    )

    const seats = await Seat.find({
      status: 'active',
    }).sort({
      section: 1,
      number: 1,
    })

    const available = []

    for (const seat of seats) {
      const conflict =
        await findConflict({
          seatId: seat._id,
          shift: selectedPlan.shift,
          startDate,
          endDate,
        })

      if (!conflict) {
        available.push(seat)
      }
    }

    res.json(available)
  }
)

// Public admission request
router.post(
  '/',
  upload.fields([
    {
      name: 'photo',
      maxCount: 1,
    },
    {
      name: 'idProof',
      maxCount: 1,
    },
  ]),
  async (req, res) => {
    const {
      name,
      email,
      phone,
      password,

      dob,
      gender,

      idProofType,
      idProofNumber,

      address,
      city,
      state,
      pincode,

      emergencyName,
      emergencyRelationship,
      emergencyPhone,

      studentType,
      institution,
      course,
      yearSemester,

      plan,
      seat,
      message,
    } = req.body

    if (
      !name ||
      !email ||
      !phone ||
      !password ||
      !plan ||
      !seat
    ) {
      throw bad(
        400,
        'Name, email, phone, password, plan and seat are required'
      )
    }

    if (password.length < 6) {
      throw bad(
        400,
        'Password must be at least 6 characters'
      )
    }

    if (
      !idProofType ||
      !req.files?.idProof?.[0]
    ) {
      throw bad(
        400,
        'ID proof type and ID proof document are required'
      )
    }

    const selectedPlan =
      await Plan.findOne({
        _id: plan,
        active: true,
      }).populate('shift')

    if (!selectedPlan) {
      throw bad(
        400,
        'Selected plan is not available'
      )
    }

    const selectedSeat =
      await Seat.findOne({
        _id: seat,
        status: 'active',
      })

    if (!selectedSeat) {
      throw bad(
        400,
        'Selected seat is not available'
      )
    }

    const startDate = todayDate()

    const endDate = planEndDate(
      selectedPlan,
      startDate
    )

    const conflict =
      await findConflict({
        seatId: selectedSeat._id,
        shift: selectedPlan.shift,
        startDate,
        endDate,
      })

    if (conflict) {
      throw bad(
        409,
        'Selected seat is no longer available. Please choose another seat.'
      )
    }

    const normalizedEmail =
      String(email).toLowerCase()

    let existingUser =
      await User.findOne({
        email: normalizedEmail,
      })

    if (
      existingUser &&
      existingUser.status === 'active'
    ) {
      throw bad(
        409,
        'An account with this email already exists'
      )
    }

    if (existingUser) {
      const pendingRequest =
        await AdmissionRequest.findOne({
          user: existingUser._id,
          status: 'pending',
        })

      if (pendingRequest) {
        throw bad(
          409,
          'An admission request with this email is already pending'
        )
      }

      existingUser.name = name
      existingUser.phone = phone
      existingUser.password = password

      existingUser.dob =
        dob || undefined

      existingUser.gender =
        gender || undefined

      existingUser.idProofType =
        idProofType

      existingUser.idProofNumber =
        idProofNumber || undefined

      existingUser.address =
        address || undefined

      existingUser.city =
        city || undefined

      existingUser.state =
        state || undefined

      existingUser.pincode =
        pincode || undefined

      existingUser.emergencyContact = {
        name:
          emergencyName || '',
        relationship:
          emergencyRelationship || '',
        phone:
          emergencyPhone || '',
      }

      existingUser.studentType =
        studentType || undefined

      existingUser.institution =
        institution || undefined

      existingUser.course =
        course || undefined

      existingUser.yearSemester =
        yearSemester || undefined

      existingUser.admissionStatus =
        'pending'

      existingUser.status =
        'active'

      await existingUser.save()
    } else {
      existingUser =
        await User.create({
          name,
          email: normalizedEmail,
          phone,
          password,

          role: 'student',

          dob: dob || undefined,

          gender:
            gender || undefined,

          idProofType,

          idProofNumber:
            idProofNumber || undefined,

          address:
            address || undefined,

          city:
            city || undefined,

          state:
            state || undefined,

          pincode:
            pincode || undefined,

          emergencyContact: {
            name:
              emergencyName || '',
            relationship:
              emergencyRelationship || '',
            phone:
              emergencyPhone || '',
          },

          studentType:
            studentType || undefined,

          institution:
            institution || undefined,

          course:
            course || undefined,

          yearSemester:
            yearSemester || undefined,

          admissionStatus:
            'pending',
        })
    }

    const photoFile =
      req.files?.photo?.[0]

    const idProofFile =
      req.files?.idProof?.[0]

    if (photoFile) {
      const uploadedPhoto =
        await uploadBuffer(
          photoFile.buffer,
          'study-library/students/photos',
          'image'
        )

      existingUser.photo = {
        url: uploadedPhoto.secure_url,
        publicId:
          uploadedPhoto.public_id,
      }
    }

    if (idProofFile) {
      const uploadedIdProof =
        await uploadBuffer(
          idProofFile.buffer,
          'study-library/students/id-proof',
          'auto'
        )

      existingUser.idProof = {
        url: uploadedIdProof.secure_url,
        publicId:
          uploadedIdProof.public_id,
      }
    }

    await existingUser.save()

    const admission =
      await AdmissionRequest.create({
        user: existingUser._id,
        plan: selectedPlan._id,
        seat: selectedSeat._id,
        message,
      })

    // Create notification for all active owner/staff users
    const admins =
      await User.find({
        role: {
          $in: ['owner', 'staff'],
        },
        status: 'active',
      }).select('_id')

    if (admins.length > 0) {
      await Notification.insertMany(
        admins.map((admin) => ({
          user: admin._id,
          type: 'info',
          title:
            'New Admission Request',
          message: `${existingUser.name} has submitted a new admission request.`,
          link:
            '/admin/admissions',
        }))
      )
    }

    res.status(201).json({
      message:
        'Admission request submitted successfully. Please wait for approval.',

      admission: {
        id: admission._id,
        status: admission.status,
      },
    })
  }
)

// Admin: view admission requests
router.get(
  '/',
  protect,
  allow('owner', 'staff'),
  async (req, res) => {
    const requests =
      await AdmissionRequest.find()
        .populate(
          'user',
          'name email phone admissionStatus photo idProof idProofType idProofNumber dob gender address city state pincode emergencyContact studentType institution course yearSemester status'
        )
        .populate(
          'plan',
          'name period durationDays price'
        )
        .populate(
          'seat',
          'number section type status'
        )
        .sort({
          createdAt: -1,
        })

    res.json(requests)
  }
)

// Admin: approve admission
router.put(
  '/:id/approve',
  protect,
  allow('owner', 'staff'),
  async (req, res) => {
    const admission =
      await AdmissionRequest.findById(
        req.params.id
      )
        .populate('plan')
        .populate('seat')

    if (!admission) {
      throw bad(
        404,
        'Admission request not found'
      )
    }

    if (
      admission.status !== 'pending'
    ) {
      throw bad(
        400,
        'Admission request has already been reviewed'
      )
    }

    const user =
      await User.findById(
        admission.user
      )

    if (!user) {
      throw bad(
        404,
        'User not found'
      )
    }

    if (
      !admission.plan ||
      !admission.plan.active
    ) {
      throw bad(
        400,
        'Selected plan is no longer available'
      )
    }

    if (
      !admission.seat ||
      admission.seat.status !== 'active'
    ) {
      throw bad(
        400,
        'Selected seat is no longer available'
      )
    }

    const plan =
      await Plan.findById(
        admission.plan._id
      ).populate('shift')

    const startDate =
      todayDate()

    const endDate =
      planEndDate(
        plan,
        startDate
      )

    const conflict =
      await findConflict({
        seatId:
          admission.seat._id,

        studentId:
          user._id,

        shift:
          plan.shift,

        startDate,
        endDate,
      })

    if (conflict) {
      throw bad(
        409,
        'Selected seat is no longer available. Please choose another seat.'
      )
    }

    let membership

    try {
      membership =
        await Membership.create({
          student:
            user._id,

          plan:
            plan._id,

          seat:
            admission.seat._id,

          shift:
            plan.shift._id,

          startDate,
          endDate,

          amount:
            plan.price,
        })

      user.admissionStatus =
        'approved'

      user.status =
        'active'

      await user.save()

      admission.status =
        'approved'

      admission.reviewedAt =
        new Date()

      admission.adminNote =
        req.body.note || ''

      await admission.save()
    } catch (error) {
      if (membership?._id) {
        await Membership.deleteOne({
          _id: membership._id,
        })
      }

      throw error
    }

    const populatedMembership =
      await Membership.findById(
        membership._id
      )
        .populate(
          'student',
          'name phone email'
        )
        .populate(
          'seat',
          'number section type'
        )
        .populate(
          'plan',
          'name durationDays price'
        )
        .populate(
          'shift',
          'name startTime endTime'
        )

    res.json({
      message:
        'Admission approved and membership created successfully',

      admission,

      membership:
        populatedMembership,
    })
  }
)

// Admin: reject admission
router.put(
  '/:id/reject',
  async (req, res) => {
    const request =
      await AdmissionRequest.findById(
        req.params.id
      )

    if (!request) {
      throw bad(
        404,
        'Admission request not found'
      )
    }

    const userId =
      request.user

    await AdmissionRequest.deleteOne({
      _id: request._id,
    })

    if (userId) {
      await User.deleteOne({
        _id: userId,
        role: 'student',
      })
    }

    res.json({
      message:
        'Admission rejected and user deleted',
    })
  }
)

export default router