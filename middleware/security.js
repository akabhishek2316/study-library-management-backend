import { rateLimit } from './rateLimit.js'

// 1. NoSQL-injection guard.
// A JSON body like { "email": { "$ne": null } } can turn a normal lookup into
// "match anything". Keys that start with "$" or contain "." are removed from
// everything the browser sends (body, query string, URL params).
function clean(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    for (const item of value) clean(item, depth + 1)
    return value
  }

  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete value[key]
    } else {
      clean(value[key], depth + 1)
    }
  }

  return value
}

export function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    clean(req.body)
  }

  // Express 5: req.query is a getter, so clean it in place
  if (req.query && typeof req.query === 'object') {
    clean(req.query)
  }

  if (req.params && typeof req.params === 'object') {
    clean(req.params)
  }

  next()
}

// 2. Security headers (this server only returns JSON/PDF, never HTML)
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  )
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  )

  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=15552000; includeSubDomains'
    )
  }

  // API answers contain personal data: never let a browser/proxy cache them
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store')
  }

  next()
}

// 3. One broad limit for the whole API (stops scraping / flooding).
// Login, admission, kiosk etc. already have their own stricter limits.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Too many requests. Please slow down.',
})

// 4. Check what an uploaded file REALLY is (the browser-sent mimetype
// can be faked), by reading the first bytes ("magic numbers").
function detectType(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) return 'image/png'
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp'
  if (buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf'
  return null
}

export function checkUploadedFiles(req, res, next) {
  const files = []

  if (req.file) files.push(req.file)

  if (Array.isArray(req.files)) {
    files.push(...req.files)
  } else if (req.files && typeof req.files === 'object') {
    for (const list of Object.values(req.files)) files.push(...list)
  }

  for (const file of files) {
    const real = detectType(file.buffer)

    if (!real || real !== file.mimetype) {
      return res.status(400).json({
        message:
          'The uploaded file is not a valid JPG, PNG, WebP image or PDF',
      })
    }
  }

  next()
}


// 5. Booking lock.
// "Is the seat free?" and "save the membership" are two separate steps.
// Without a lock two people booking the same seat at the same moment could
// both pass the first step. Requests that change memberships / admissions /
// seat changes are therefore handled one at a time (they are quick).
// If you ever run more than one server instance, replace this with a
// database lock or a transaction.
let queue = Promise.resolve()

export function bookingLock(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next()
  }

  // the public apply form uploads files (slow) and does not take a seat
  if (req.baseUrl === '/api/admissions' && req.method === 'POST' && req.path === '/') {
    return next()
  }

  let release
  const turn = new Promise((resolve) => {
    release = resolve
  })

  const previous = queue
  queue = previous.then(() => turn)

  let done = false
  const finish = () => {
    if (!done) {
      done = true
      release()
    }
  }

  res.on('finish', finish)
  res.on('close', finish)

  // never wait more than 20 s for the previous request
  Promise.race([
    previous,
    new Promise((resolve) => setTimeout(resolve, 20000)),
  ]).then(() => next())
}
