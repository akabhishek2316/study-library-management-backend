import multer from 'multer'

const storage = multer.memoryStorage()

const allowedTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
      const err = new Error(
        'Only JPG, PNG, WebP images and PDF files are allowed'
      )

      err.status = 400

      return cb(err)
    }

    cb(null, true)
  },
})

export default upload