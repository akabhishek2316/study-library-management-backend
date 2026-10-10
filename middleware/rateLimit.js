// Small in-memory rate limiter (no extra package needed).
// Works per server instance, which is fine for a single Render service.
// Used on public endpoints that can be guessed or spammed
// (login, register, admission form, kiosk activation, receipt check).

const hits = new Map()

setInterval(() => {
  const now = Date.now()

  for (const [key, value] of hits) {
    if (value.resetAt <= now) {
      hits.delete(key)
    }
  }
}, 60 * 1000).unref()

export function rateLimit({
  windowMs = 15 * 60 * 1000,
  max = 20,
  message = 'Too many attempts. Please try again later.',
  key = (req) => req.ip,
} = {}) {
  // every limiter keeps its own counters
  const bucket = Math.random().toString(36).slice(2)

  return (req, res, next) => {
    const k = `${bucket}:${key(req)}`
    const now = Date.now()

    let entry = hits.get(k)

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      hits.set(k, entry)
    }

    entry.count += 1

    if (entry.count > max) {
      res.setHeader(
        'Retry-After',
        Math.ceil((entry.resetAt - now) / 1000)
      )

      return res.status(429).json({ message })
    }

    next()
  }
}
