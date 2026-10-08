import { Router } from 'express'

import AdmissionRequest from '../models/AdmissionRequest.js'
import User from '../models/User.js'
import Plan from '../models/Plan.js'
import Hall from '../models/Hall.js'
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

// Public: available halls for selected plan
router.get(
  '/available-halls',
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

    const startDate =
      todayDate()

    const endDate =
      planEndDate(
        selectedPlan,
        startDate
      )

    const halls =
      await Hall.find({
        active: true,
      }).sort({
        name: 1,
      })

    const result = []

    for (const hall of halls) {
      const seats =
        await Seat.find({
          hall: hall._id,
          status: 'active',
        })

      let availableSeats = 0

      for (const seat of seats) {
        const conflict =
          await findConflict({
            seatId: seat._id,
            shift:
              selectedPlan.shift,
            startDate,
            endDate,
          })

        if (!conflict) {
          availableSeats += 1
        }
      }

      result.push({
        _id: hall._id,
        name: hall.name,
        type: hall.type,
        description:
          hall.description,
        capacity: hall.capacity,
        availableSeats,
      })
    }

    res.json(result)
  }
)

// Public: admission request
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
      preferredHall,
      message,
    } = req.body

    if (
      !name ||
      !email ||
      !phone ||
      !password ||
      !plan ||
      !preferredHall
    ) {
      throw bad(
        400,
        'Name, email, phone, password, plan and preferred hall are required'
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

    const selectedHall =
      await Hall.findOne({
        _id: preferredHall,
        active: true,
      })

    if (!selectedHall) {
      throw bad(
        400,
        'Selected hall is not available'
      )
    }

    const hallSeats =
      await Seat.countDocuments({
        hall: selectedHall._id,
        status: 'active',
      })

    if (hallSeats === 0) {
      throw bad(
        400,
        'Selected hall has no active seats'
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
      existingUser.status === 'active' &&
      existingUser.admissionStatus ===
        'approved'
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
      existingUser.password =
        password

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

          dob:
            dob || undefined,

          gender:
            gender || undefined,

          idProofType,

          idProofNumber:
            idProofNumber ||
            undefined,

          address:
            address ||
            undefined,

          city:
            city ||
            undefined,

          state:
            state ||
            undefined,

          pincode:
            pincode ||
            undefined,

          emergencyContact: {
            name:
              emergencyName || '',
            relationship:
              emergencyRelationship || '',
            phone:
              emergencyPhone || '',
          },

          studentType:
            studentType ||
            undefined,

          institution:
            institution ||
            undefined,

          course:
            course ||
            undefined,

          yearSemester:
            yearSemester ||
            undefined,

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
        url:
          uploadedPhoto.secure_url,
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
        url:
          uploadedIdProof.secure_url,
        publicId:
          uploadedIdProof.public_id,
      }
    }

    await existingUser.save()

    const admission =
      await AdmissionRequest.create({
        user:
          existingUser._id,

        plan:
          selectedPlan._id,

        preferredHall:
          selectedHall._id,

        message,
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

    if (admins.length > 0) {
      await Notification.insertMany(
        admins.map((admin) => ({
          user: admin._id,
          type: 'info',
          title:
            'New Admission Request',
          message:
            `${existingUser.name} has submitted a new admission request.`,
          link:
            '/admin/admissions',
        }))
      )
    }

    res.status(201).json({
  message:
    'Admission request submitted successfully. Please wait for approval. \n Log in with your registered email and password to track your admission approval status from your dashboard.',

  admission: {
    id: admission._id,
    status: admission.status,
  },
})
  }
)

// Student: latest admission
router.get(
  '/mine',
  protect,
  async (req, res) => {
    if (
      req.user.role !==
      'student'
    ) {
      return res.status(403).json({
        message:
          'Not allowed',
      })
    }

    const admission =
      await AdmissionRequest.findOne({
        user:
          req.user._id,
      })
        .sort({
          createdAt: -1,
        })
        .populate(
          'plan',
          'name period durationDays price'
        )
        .populate(
          'preferredHall',
          'name type description capacity'
        )

    if (!admission) {
      return res.json({
        status:
          req.user.admissionStatus ||
          'pending',

        adminNote: '',

        admission: null,
      })
    }

    res.json({
      status:
        admission.status,

      adminNote:
        admission.adminNote ||
        '',

      admission: {
        id:
          admission._id,

        status:
          admission.status,

        adminNote:
          admission.adminNote ||
          '',

        plan:
          admission.plan,

        preferredHall:
          admission.preferredHall,

        createdAt:
          admission.createdAt,

        reviewedAt:
          admission.reviewedAt,
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
          'preferredHall',
          'name type description capacity'
        )
        .sort({
          createdAt: -1,
        })

    res.json(requests)
  }
)

// Admin: get available seats
// for a specific admission and selected hall
router.get(
  '/:id/available-seats',
  protect,
  allow('owner', 'staff'),
  async (req, res) => {
    const {
      hall,
    } = req.query

    const admission =
      await AdmissionRequest.findById(
        req.params.id
      )
        .populate('plan')
        .populate('preferredHall')

    if (!admission) {
      throw bad(
        404,
        'Admission request not found'
      )
    }

    if (
      admission.status !==
      'pending'
    ) {
      throw bad(
        400,
        'Admission request has already been reviewed'
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
      !admission.preferredHall ||
      !admission.preferredHall.active
    ) {
      throw bad(
        400,
        'Preferred hall is no longer available'
      )
    }

    const selectedHallId =
      hall ||
      admission.preferredHall._id

    const selectedHall =
      await Hall.findOne({
        _id: selectedHallId,
        active: true,
      })

    if (!selectedHall) {
      throw bad(
        400,
        'Selected hall is not available'
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

    const seats =
      await Seat.find({
        hall:
          selectedHall._id,

        status:
          'active',
      }).sort({
        number: 1,
      })

    const available = []

    for (const seat of seats) {
      const conflict =
        await findConflict({
          seatId:
            seat._id,

          shift:
            plan.shift,

          startDate,
          endDate,
        })

      if (!conflict) {
        available.push(seat)
      }
    }

    res.json({
      hall: {
        _id:
          selectedHall._id,

        name:
          selectedHall.name,

        type:
          selectedHall.type,
      },

      seats:
        available,
    })
  }
)

// Admin: approve admission
router.put(
  '/:id/approve',
  protect,
  allow('owner', 'staff'),
  async (req, res) => {
    const {
      hall,
      seat,
      note,
    } = req.body

    if (!hall || !seat) {
      throw bad(
        400,
        'Please assign a hall and seat before approving this admission'
      )
    }

    const admission =
      await AdmissionRequest.findById(
        req.params.id
      )
        .populate('plan')
        .populate('preferredHall')

    if (!admission) {
      throw bad(
        404,
        'Admission request not found'
      )
    }

    if (
      admission.status !==
      'pending'
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

    const selectedHall =
      await Hall.findOne({
        _id: hall,
        active: true,
      })

    if (!selectedHall) {
      throw bad(
        400,
        'Selected hall is not available'
      )
    }

    const selectedSeat =
      await Seat.findOne({
        _id: seat,

        hall:
          selectedHall._id,

        status:
          'active',
      })

    if (!selectedSeat) {
      throw bad(
        400,
        'Selected seat is not available in the selected hall'
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
          selectedSeat._id,

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

          hall:
            selectedHall._id,

          seat:
            selectedSeat._id,

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
        note || ''

      await admission.save()
    } catch (error) {
      if (membership?._id) {
        await Membership.deleteOne({
          _id:
            membership._id,
        })
      }

      throw error
    }

    await Notification.create({
      user:
        user._id,

      type:
        'info',

      title:
        'Admission Approved',

      message:
        'Congratulations! Your admission has been approved and your membership is now active.',

      link:
        '/student',
    })

    const populatedMembership =
      await Membership.findById(
        membership._id
      )
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
          'number hall section type'
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
  protect,
  allow('owner', 'staff'),
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

    if (
      request.status !==
      'pending'
    ) {
      throw bad(
        400,
        'Admission request has already been reviewed'
      )
    }

    const userId =
      request.user

    request.status =
      'rejected'

    request.reviewedAt =
      new Date()

    request.adminNote =
      req.body.note || ''

    await request.save()

    if (userId) {
      await User.findByIdAndUpdate(
        userId,
        {
          admissionStatus:
            'rejected',
        }
      )

      await Notification.create({
        user: userId,
        type: 'info',
        title:
          'Admission Not Approved',
        message:
          request.adminNote
            ? `Your admission request was not approved. Note: ${request.adminNote}`
            : 'Your admission request was not approved.',
        link:
          '/student',
      })
    }

    res.json({
      message:
        'Admission rejected. The student can login to view the admission status.',
    })
  }
)

export default router