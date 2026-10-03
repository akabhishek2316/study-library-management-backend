import nodemailer from 'nodemailer'
import { cfg } from './config.js'

let transporter

export const mailEnabled = () =>
  !!process.env.SMTP_HOST

// Sends a plain-text email. If SMTP isn't configured,
// it quietly does nothing (in-app notifications still work).
export async function sendMail({ to, subject, text }) {
  if (!mailEnabled() || !to) return false

  try {
    transporter ||= nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    })

    const name = cfg().libraryName

    await transporter.sendMail({
      from:
        process.env.MAIL_FROM ||
        `"${name}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    })

    return true
  } catch (err) {
    console.error('Email failed:', err.message)

    return false
  }
}