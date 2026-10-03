import PDFDocument from 'pdfkit'
import { cfg } from './config.js'

const rs = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`

const hm = (m) =>
  `${Math.floor(m / 60)}h ${String(
    Math.round(m % 60)
  ).padStart(2, '0')}m`

export function streamMonthlyPdf(res, s) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader(
    'Content-Disposition',
    `inline; filename="report-${s.month}.pdf"`
  )

  doc.pipe(res)

  const W = doc.page.width - 80

  const heading = (t) => {
    doc
      .moveDown(1)
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#2563eb')
      .text(t, 40)

    doc
      .moveTo(40, doc.y + 2)
      .lineTo(40 + W, doc.y + 2)
      .strokeColor('#e2e8f0')
      .stroke()

    doc.moveDown(0.5)
  }

  const kv = (k, v) => {
    const y = doc.y

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#64748b')
      .text(k, 40, y, { width: 200 })

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0f172a')
      .text(v, 250, y, { width: W - 210 })

    doc.moveDown(0.3)
  }

  const table = (cols, rows) => {
    const x0 = 40
    const widths = cols.map((c) => c.w * W)

    const line = (cells, bold) => {
      if (doc.y > doc.page.height - 70) {
        doc.addPage()
      }

      const y = doc.y
      let x = x0

      cells.forEach((t, i) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor(bold ? '#475569' : '#0f172a')
          .text(String(t ?? ''), x + 2, y, {
            width: widths[i] - 4,
            align: cols[i].right ? 'right' : 'left',
            lineBreak: false,
            ellipsis: true,
          })

        x += widths[i]
      })

      doc.y = y + 15
    }

    line(
      cols.map((c) => c.h),
      true
    )

    doc
      .moveTo(x0, doc.y - 2)
      .lineTo(x0 + W, doc.y - 2)
      .strokeColor('#e2e8f0')
      .stroke()

    rows.forEach((r) => line(r))

    if (rows.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#94a3b8')
        .text('Nothing to show', x0 + 2)
    }
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor('#0f172a')
    .text(cfg().libraryName, 40)

  doc
    .font('Helvetica')
    .fontSize(12)
    .fillColor('#64748b')
    .text(`Monthly report - ${s.month}`)

  heading('Money')

  kv('Collected', rs(s.collected))
  kv('Refunded', rs(s.refunded))
  kv('Net collection', rs(s.collected - s.refunded))
  kv('Pending dues (as of now)', rs(s.totalDue))

  heading('Collections by method')

  table(
    [
      { h: 'Method', w: 0.5 },
      { h: 'Payments', w: 0.2, right: true },
      { h: 'Amount', w: 0.3, right: true },
    ],
    Object.entries(s.byMethod).map(([m, v]) => [
      m.toUpperCase(),
      v.count,
      rs(v.amount),
    ])
  )

  heading('Students and plans')

  kv('New students', s.newStudents)
  kv('New memberships', s.newMemberships)

  heading('Attendance')

  kv('Total visits', s.visits)
  kv('Students who came', s.presentStudents)
  kv('Total study time', hm(s.totalMinutes))

  doc.moveDown(0.6)

  table(
    [
      { h: 'Top students by hours', w: 0.5 },
      { h: 'Days', w: 0.2, right: true },
      { h: 'Hours', w: 0.3, right: true },
    ],
    s.top.map((r) => [
      r.name,
      r.daysPresent,
      hm(r.minutes),
    ])
  )

  heading('Pending dues (largest first)')

  table(
    [
      { h: 'Student', w: 0.4 },
      { h: 'Seat', w: 0.12 },
      { h: 'Plan', w: 0.28 },
      { h: 'Due', w: 0.2, right: true },
    ],
    s.dues.map((m) => [
      m.student?.name,
      m.seat?.number,
      m.plan?.name,
      rs(m.due),
    ])
  )

  doc
    .moveDown(2)
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#94a3b8')
    .text(
      `Generated on ${new Date().toISOString().slice(0, 10)}`,
      40,
      doc.y,
      {
        align: 'center',
        width: W,
      }
    )

  doc.end()
}