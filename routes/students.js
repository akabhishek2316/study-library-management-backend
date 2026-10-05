import { Router } from 'express'
import crypto from 'crypto'

import User from '../models/User.js'
import Membership from '../models/Membership.js'

import {
  protect,
  allow,
} from '../middleware/auth.js'

import upload from '../middleware/upload.js'
import cloudinary from '../config/cloudinary.js'

import {
  bad,
  todayDate,
} from '../utils/dates.js'

const router = Router()

router.use(
  protect,
  allow('owner', 'staff')
)

const FIELDS = [
  'name',
  'email',
  'phone',
  'dob',
  'gender',
  'idProofType',
  'idProofNumber',
  'address',
  'city',
  'state',
  'pincode',
  'emergencyContact',
  'studentType',
  'institution',
  'course',
  'yearSemester',
]

const pick = (body) =>
  Object.fromEntries(
    FIELDS
      .filter(
        (k) =>
          body[k] !== undefined
      )
      .map((k) => [
        k,
        body[k],
      ])
  )

const uploadToCloudinary = (
  buffer,
  folder,
  resourceType
) =>
  new Promise(
    (resolve, reject) => {
      const stream =
        cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type:
              resourceType,
          },
          (
            error,
            result
          ) => {
            if (error) {
              reject(error)
              return
            }

            resolve(result)
          }
        )

      stream.end(buffer)
    }
  )

const deleteFromCloudinary =
  async (
    publicId,
    resourceType = 'image'
  ) => {
    if (!publicId) return

    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type:
          resourceType,
        invalidate: true,
      }
    )
  }

router.get(
  '/',
  async (req, res) => {
    const {
      q,
      status = 'active',
    } = req.query

    const filter = {
      role: 'student',
      admissionStatus: 'approved',
    }

    if (status !== 'all') {
      filter.status = status
    }

    if (q) {
      const rx =
        new RegExp(
          String(q).replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          ),
          'i'
        )

      filter.$or = [
        { name: rx },
        { email: rx },
        { phone: rx },
      ]
    }

    const students =
      await User.find(filter)
        .select('-password')
        .sort({ name: 1 })
        .lean()

    const today =
      todayDate()

    const current =
      await Membership.find({
        student: {
          $in: students.map(
            (s) => s._id
          ),
        },
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
        .populate(
          'seat',
          'number section type'
        )
        .populate(
          'plan',
          'name price durationDays'
        )
        .populate(
          'shift',
          'name startTime endTime'
        )
        .lean()

    const byStudent =
      new Map(
        current.map((m) => [
          String(m.student),
          m,
        ])
      )

    res.json(
      students.map((s) => ({
        ...s,
        current:
          byStudent.get(
            String(s._id)
          ) || null,
      }))
    )
  }
)

router.post(
  '/',
  async (req, res) => {
    const data = pick(
      req.body
    )

    if (
      !data.name ||
      !data.email
    ) {
      throw bad(
        400,
        'Name and email are required'
      )
    }

    const tempPassword =
      req.body.password ||
      crypto
        .randomBytes(4)
        .toString('hex')

    const student =
      await User.create({
        ...data,
        password:
          tempPassword,
        role: 'student',
        admissionStatus:
          'approved',
      })

    res.status(201).json({
      student:
        student.toSafe(),
      tempPassword,
    })
  }
)

router.get(
  '/:id',
  async (req, res) => {
    const student =
      await User.findOne({
        _id: req.params.id,
        role: 'student',
      }).select('-password')

    if (!student) {
      throw bad(
        404,
        'Student not found'
      )
    }

    const today =
      todayDate()

    const membership =
      await Membership.findOne({
        student:
          student._id,
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
        .populate(
          'seat',
          'number section type'
        )
        .populate(
          'plan',
          'name price durationDays'
        )
        .populate(
          'shift',
          'name startTime endTime'
        )
        .lean()

    res.json({
      ...student.toSafe(),
      current:
        membership || null,
    })
  }
)

router.put(
  '/:id',
  async (req, res) => {
    const student =
      await User.findOneAndUpdate(
        {
          _id: req.params.id,
          role: 'student',
        },
        pick(req.body),
        {
          new: true,
          runValidators: true,
        }
      ).select(
        '-password'
      )

    if (!student) {
      throw bad(
        404,
        'Student not found'
      )
    }

    res.json(
      student
    )
  }
)

/*
  Upload student photo / Aadhaar.

  Only owner/staff can reach this route because
  router.use(protect, allow('owner', 'staff'))
  is applied above.
*/
router.post(
  '/:id/documents',
  upload.fields([
    {
      name: 'photo',
      maxCount: 1,
    },
    {
      name: 'aadhar',
      maxCount: 1,
    },
  ]),
  async (req, res) => {
    const student =
      await User.findOne({
        _id: req.params.id,
        role: 'student',
      })

    if (!student) {
      throw bad(
        404,
        'Student not found'
      )
    }

    const photo =
      req.files?.photo?.[0]

    const aadhar =
      req.files?.aadhar?.[0]

    if (
      !photo &&
      !aadhar
    ) {
      throw bad(
        400,
        'Photo or Aadhaar file is required'
      )
    }

    const updates = {}

    if (photo) {
      if (
        ![
          'image/jpeg',
          'image/png',
          'image/webp',
        ].includes(
          photo.mimetype
        )
      ) {
        throw bad(
          400,
          'Photo must be JPG, PNG or WebP'
        )
      }

      const result =
        await uploadToCloudinary(
          photo.buffer,
          'study-library/students/photos',
          'image'
        )

      if (
        student.photo?.publicId
      ) {
        await deleteFromCloudinary(
          student.photo
            .publicId,
          'image'
        )
      }

      updates.photo = {
        url: result.secure_url,
        publicId:
          result.public_id,
      }
    }

    if (aadhar) {
      if (
        ![
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ].includes(
          aadhar.mimetype
        )
      ) {
        throw bad(
          400,
          'Aadhaar must be JPG, PNG, WebP or PDF'
        )
      }

      const resourceType =
        aadhar.mimetype ===
        'application/pdf'
          ? 'raw'
          : 'image'

      const result =
        await uploadToCloudinary(
          aadhar.buffer,
          'study-library/students/aadhar',
          resourceType
        )

      if (
        student.idProof?.publicId
      ) {
        await deleteFromCloudinary(
          student.idProof
            .publicId,
          resourceType
        )
      }

      updates.idProof = {
        url: result.secure_url,
        publicId:
          result.public_id,
      }
    }

    Object.assign(
      student,
      updates
    )

    await student.save()

    res.json({
      message:
        'Documents uploaded successfully',
      student:
        student.toSafe(),
    })
  }
)

// Activate an inactive student.
router.patch(
  '/:id/activate',
  async (req, res) => {
    const student =
      await User.findOneAndUpdate(
        {
          _id: req.params.id,
          role: 'student',
          admissionStatus:
            'approved',
          status: 'inactive',
        },
        {
          status: 'active',
        },
        {
          new: true,
        }
      ).select(
        '-password'
      )

    if (!student) {
      throw bad(
        404,
        'Inactive student not found'
      )
    }

    res.json({
      message:
        'Student activated',
      student,
    })
  }
)

// "Delete" = deactivate.
// Active memberships are cancelled so the seat becomes free again.
router.delete(
  '/:id',
  async (req, res) => {
    const student =
      await User.findOneAndUpdate(
        {
          _id: req.params.id,
          role: 'student',
        },
        {
          status: 'inactive',
        },
        {
          new: true,
        }
      )

    if (!student) {
      throw bad(
        404,
        'Student not found'
      )
    }

    await Membership.updateMany(
      {
        student:
          student._id,
        status: {
          $in: [
            'active',
            'paused',
          ],
        },
      },
      {
        status:
          'cancelled',
      }
    )

    res.json({
      message:
        'Student deactivated',
    })
  }
)

export default router