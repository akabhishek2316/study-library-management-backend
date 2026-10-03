import Notification from '../models/Notification.js'
import User from '../models/User.js'
import { sendMail } from './mailer.js'
import { cfg } from './config.js'

/**
 * Creates an in-app notification (and optionally an email).
 * Never throws, so a notification problem can't break a payment
 * or a membership change.
 *
 * Returns the notification, or null if it was a duplicate.
 */
export async function notify(
  userId,
  {
    type = 'info',
    title,
    message = '',
    link = '',
    dedupeKey,
    email = false,
  }
) {
  try {
    const n = await Notification.create({
      user: userId,
      type,
      title,
      message,
      link,
      dedupeKey,
    })

    if (email) {
      const u = await User.findById(userId)
        .select('name email')

      if (u?.email) {
        const lib = cfg().libraryName

        sendMail({
          to: u.email,
          subject: title,
          text: `Hi ${u.name},\n\n${message}\n\n- ${lib}`,
        })
      }
    }

    return n
  } catch (err) {
    if (err.code !== 11000) {
      console.error('notify failed:', err.message)
    } // 11000 = already sent

    return null
  }
}

export const notifyStaff = async (payload) => {
  const staff = await User.find({
    role: { $in: ['owner', 'staff'] },
    status: 'active',
  }).select('_id')

  await Promise.all(
    staff.map((u) => notify(u._id, payload))
  )
}