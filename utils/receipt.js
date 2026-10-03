import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import crypto from 'node:crypto'

const C = {
  navy: '#163253',
  green: '#15803D',
  red: '#B91C1C',
  amber: '#B45309',
  text: '#1E293B',
  muted: '#64748B',
  border: '#CBD5E1',
  lightGreen: '#BBF7D0',
}

const rs = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const day = (d) => {
  if (!d) return '-'

  const date = new Date(d)

  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const dateTime = (d) => {
  if (!d) return '-'

  const date = new Date(d)

  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function streamReceipt(res, payment, balanceDue) {
  const refund = payment.type === 'refund'
  const membership = payment.membership

  const libraryName =
    process.env.LIBRARY_NAME || 'Reading Room the Library'

  // Prepare QR before starting the HTTP response.
  const frontendUrl = process.env.FRONTEND_URL

  if (!frontendUrl) {
    throw new Error('FRONTEND_URL is not configured')
  }

  if (!payment.verifyToken) {
    payment.verifyToken = crypto.randomBytes(24).toString('hex')
    await payment.save()
  }

  const verificationUrl =
    `${frontendUrl.replace(/\/+$/, '')}/verify-receipt/${payment.verifyToken}`

  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: {
      dark: C.navy,
      light: '#FFFFFF',
    },
  })

  const doc = new PDFDocument({
    size: 'A5',
    layout: 'portrait',
    margin: 20,
    bufferPages: false,
    info: {
      Title: `${refund ? 'Refund' : 'Payment'} Receipt ${payment.receiptNo}`,
      Author: libraryName,
    },
  })

  res.setHeader('Content-Type', 'application/pdf')

  res.setHeader(
    'Content-Disposition',
    `inline; filename="${payment.receiptNo}.pdf"`
  )

  doc.on('error', (err) => {
    console.error('Receipt PDF error:', err)

    if (!res.headersSent && !res.destroyed) {
      res.status(500).end('Could not generate receipt PDF')
    } else if (!res.destroyed) {
      res.destroy(err)
    }
  })

  doc.pipe(res)

  const W = doc.page.width
  const H = doc.page.height
  const L = 35
  const R = W - 35
  const CW = R - L
  const HALF = CW / 2

  const txt = (str, x, y, width, opts = {}) => {
    doc
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size || 8)
      .fillColor(opts.color || C.text)
      .text(String(str ?? '-'), x, y, {
        width,
        height: opts.height || 12,
        lineBreak: false,
        ellipsis: true,
        align: opts.align || 'left',
      })
  }

  const label = (str, x, y, width) => {
    txt(String(str).toUpperCase(), x, y, width, {
      size: 6.5,
      color: C.muted,
      height: 9,
    })
  }

  const rule = (y, color = C.border) => {
    doc.save()

    doc
      .moveTo(L, y)
      .lineTo(R, y)
      .lineWidth(0.65)
      .strokeColor(color)
      .stroke()

    doc.restore()
  }

  const outline = (
    x,
    y,
    w,
    h,
    color = C.border,
    radius = 5
  ) => {
    doc.save()

    doc
      .roundedRect(x, y, w, h, radius)
      .lineWidth(0.8)
      .strokeColor(color)
      .stroke()

    doc.restore()
  }

  const section = (title, y) => {
    txt(title.toUpperCase(), L, y, CW, {
      size: 8,
      bold: true,
      color: C.navy,
    })

    rule(y + 13)
  }

  // HEADER — no dark background and no unwanted divider
  outline(L, 19, CW, 75, C.navy, 6)
  outline(L + 10, 29, 29, 29, C.navy, 5)

  txt('RL', L + 10, 37, 29, {
    size: 12,
    bold: true,
    color: C.navy,
    align: 'center',
  })

  txt(libraryName, L + 47, 30, CW - 58, {
    size: 10.5,
    bold: true,
    color: C.navy,
  })

  if (process.env.LIBRARY_ADDRESS) {
    txt(
      process.env.LIBRARY_ADDRESS,
      L + 47,
      45,
      CW - 58,
      {
        size: 6.5,
        color: C.muted,
      }
    )
  }

  txt(
    refund ? 'REFUND RECEIPT' : 'PAYMENT RECEIPT',
    L + 10,
    69,
    CW - 120,
    {
      size: 9,
      bold: true,
      color: C.navy,
    }
  )

  outline(
    R - 94,
    66,
    84,
    21,
    refund ? C.red : C.green,
    9
  )

  txt(
    refund ? 'REFUNDED' : 'SUCCESS',
    R - 91,
    72,
    78,
    {
      size: 7,
      bold: true,
      color: refund ? C.red : C.green,
      align: 'center',
    }
  )

  txt(
    `Receipt No. ${payment.receiptNo}`,
    L + 10,
    82,
    CW - 20,
    {
      size: 7,
      color: C.muted,
    }
  )

  // AMOUNT
  outline(
    L,
    102,
    CW,
    55,
    refund ? '#FECACA' : C.lightGreen,
    6
  )

  label(
    refund ? 'Amount refunded' : 'Amount received',
    L + 10,
    109,
    CW - 20
  )

  txt(rs(payment.amount), L + 10, 121, CW - 20, {
    size: 18,
    bold: true,
    color: refund ? C.red : C.green,
    height: 22,
  })

  txt(
    `Payment method: ${String(payment.method || '-').toUpperCase()}`,
    L + 10,
    144,
    CW - 20,
    {
      size: 7,
      color: C.muted,
    }
  )

  // PAYMENT INFORMATION — fixed, separate columns
  const COL2 = L + HALF + 5
  const COLW = HALF - 5

  label('Payment date', L, 169, COLW)

  txt(dateTime(payment.paidAt), L, 180, COLW, {
    size: 7.2,
  })

  label('Receipt number', COL2, 169, COLW)

  txt(payment.receiptNo, COL2, 180, COLW, {
    size: 7.2,
  })

  rule(198)

  // STUDENT DETAILS — no overlapping columns
  section('Student details', 207)

  label('Student name', L, 226, COLW)

  txt(payment.student?.name || '-', L, 237, COLW, {
    size: 8,
    bold: true,
  })

  label('Phone number', COL2, 226, COLW)

  txt(payment.student?.phone || '-', COL2, 237, COLW, {
    size: 8,
  })

  // Membership section
  section('Membership details', 263)

  // QR is placed in its own reserved right-side column.
  const qrSize = 48
  const qrX = R - qrSize
  const qrY = 281
  const detailsRight = qrX - 12
  const detailsWidth = detailsRight - L
  const detailHalf = detailsWidth / 2
  const detailCol2 = L + detailHalf + 4
  const detailColW = detailHalf - 4

  if (membership) {
    label('Membership plan', L, 282, detailColW)

    txt(
      membership.plan?.name || '-',
      L,
      293,
      detailColW,
      { size: 7.5 }
    )

    label('Shift', detailCol2, 282, detailColW)

    txt(
      membership.shift?.name || '-',
      detailCol2,
      293,
      detailColW,
      { size: 7.5 }
    )

    label('Seat number', L, 311, detailColW)

    txt(
      membership.seat?.number || '-',
      L,
      322,
      detailColW,
      { size: 7.5 }
    )

    label('Membership period', detailCol2, 311, detailColW)

    txt(
      `${day(membership.startDate)} - ${day(membership.endDate)}`,
      detailCol2,
      322,
      detailColW,
      { size: 6.8 }
    )
  }

  doc.image(qrDataUrl, qrX, qrY, {
    width: qrSize,
    height: qrSize,
  })

  txt(
    'SCAN TO VERIFY',
    qrX - 5,
    qrY + qrSize + 3,
    qrSize + 10,
    {
      size: 5.2,
      color: C.muted,
      align: 'center',
    }
  )

  // BALANCE — full-width panel below details and QR
  const balanceY = 342

  outline(L, balanceY, CW, 29, C.border, 5)

  txt(
    'BALANCE DUE',
    L + 9,
    balanceY + 10,
    HALF,
    {
      size: 7.5,
      bold: true,
      color: C.navy,
    }
  )

  txt(
    rs(balanceDue),
    L + HALF,
    balanceY + 8,
    HALF - 9,
    {
      size: 10.5,
      bold: true,
      color: Number(balanceDue) > 0 ? C.amber : C.green,
      align: 'right',
    }
  )

  // Optional note gets its own row.
  if (payment.note) {
    label('Note', L, 380, CW)

    txt(payment.note, L, 390, CW, {
      size: 7,
      height: 10,
    })
  }

  // SIGNATURE AND STAMP
  const signTop = H - 107

  rule(signTop)

  doc.save()

  doc
    .moveTo(L + 8, signTop + 39)
    .lineTo(L + CW * 0.46, signTop + 39)
    .lineWidth(0.8)
    .strokeColor(C.border)
    .stroke()

  doc.restore()

  txt(
    'AUTHORIZED SIGNATORY',
    L + 4,
    signTop + 45,
    CW * 0.45,
    {
      size: 7,
      bold: true,
      color: C.navy,
      align: 'center',
    }
  )

  txt(
    libraryName,
    L + 4,
    signTop + 57,
    CW * 0.45,
    {
      size: 6.2,
      color: C.muted,
      align: 'center',
    }
  )

  const stampX = L + CW * 0.61
  const stampW = CW * 0.34

  outline(
    stampX,
    signTop + 5,
    stampW,
    44,
    '#94A3B8',
    4
  )

  txt(
    'OFFICIAL STAMP',
    stampX + 3,
    signTop + 23,
    stampW - 6,
    {
      size: 6.2,
      color: C.muted,
      align: 'center',
    }
  )

  // FOOTER
  const footerY = H - 28

  rule(footerY)

  txt(
    'Computer-generated receipt | Thank you for choosing our library!',
    L,
    footerY + 7,
    CW,
    {
      size: 6.1,
      color: C.muted,
      align: 'center',
      height: 9,
    }
  )

  // Only one end() call.
  doc.end()
}