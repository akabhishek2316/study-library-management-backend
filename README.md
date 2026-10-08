# 📚 Study Library Management System — Backend

The backend API for the **Study Library Management System**, built with **Node.js, Express.js, MongoDB, and Mongoose**.

It provides secure REST APIs for authentication, student management, admissions, seats, shifts, memberships, payments, attendance, notices, notifications, feedback, analytics, and reports.

## 🌐 Live Application

👉 **[Study Library — Live Demo](https://study-library-management.netlify.app/)**

## 🔗 Repositories

### Backend

👉 **[GitHub — Backend](https://github.com/akabhishek2316/study-library-management-backend)**

### Frontend

👉 **[GitHub — Frontend](https://github.com/akabhishek2316/study-library-management)**

---

# ✨ Features

## 🔐 Authentication & Authorization

* JWT-based authentication.
* User registration.
* User login.
* Protected API routes.
* Role-based authorization.
* Password hashing with bcrypt.
* Change password.
* Account status validation.

Supported roles:

```text
owner
staff
student
```

---

# 👨‍🎓 Student & Admission Management

The backend supports:

* Student registration.
* Student profiles.
* Student status management.
* Admission requests.
* Admission approval.
* Admission rejection.
* Admin notes for rejected admissions.
* Student admission status.

Admission states include:

```text
pending
approved
rejected
```

---

# 🏢 Library Structure

The library follows this structure:

```text
Library
   ↓
Hall
   ↓
Seat
```

## Hall Types

```text
AC
Non-AC
Cabin
```

Seats are associated with:

* Hall
* Section
* Seat number
* Status
* Floor-plan position

Seat status:

```text
active
maintenance
```

---

# 💺 Seat Management

The backend handles:

* Seat creation.
* Bulk seat creation.
* Seat status.
* Maintenance mode.
* Seat deletion.
* Seat layout positions.
* Seat availability.
* Seat occupancy.
* Seat allocation.
* Seat transfer.
* Seat change requests.

## Seat Conflict Prevention

The backend validates membership and seat conflicts before assigning seats.

The system prevents overlapping assignments where required by shift and date.

Compatible shifts can share the same physical seat when their time ranges do not overlap.

---

# 🕒 Shift Management

The backend supports library shifts and their schedules.

Shift information is used for:

* Seat allocation.
* Memberships.
* Attendance.
* Seat conflict validation.

---

# 📋 Plans & Memberships

Membership functionality includes:

* Membership plans.
* Monthly plans.
* Quarterly plans.
* Half-yearly plans.
* Custom duration plans.
* Seat assignment.
* Hall assignment.
* Shift assignment.
* Start date.
* End date.
* Purchase amount.
* Membership status.

Membership statuses:

```text
active
paused
cancelled
```

The backend supports:

* Creating memberships.
* Renewing memberships.
* Pausing memberships.
* Resuming memberships.
* Cancelling memberships.
* Seat transfers.
* Membership history.

---

# 💳 Payments

The backend supports library payment management.

Features include:

* Payment records.
* Membership payments.
* Online payments.
* Razorpay order creation.
* Razorpay payment verification.
* Payment status.
* Receipt information.
* Receipt verification.

Payment verification is performed server-side.

---

# 📱 Attendance System

The attendance system supports:

* Student QR scanning.
* Daily attendance.
* GPS/geofence verification.
* Attendance history.
* Staff attendance management.
* Manual attendance.
* Attendance reports.
* Monthly reports.
* Absent reports.

The existing attendance records remain part of the Attendance domain.

---

# 🖥️ Attendance Kiosk

The backend contains a separate kiosk authentication system.

The kiosk does **not** use:

* Admin JWT
* Staff JWT
* Student JWT

Instead, kiosks use their own secure token.

## Kiosk Flow

```text
Staff/Admin
     ↓
Create Kiosk
     ↓
Temporary 6-Digit Activation Code
     ↓
Kiosk Activation
     ↓
Kiosk Token
     ↓
Attendance QR Code
     ↓
Student Scans QR
     ↓
Student JWT + QR + GPS
     ↓
Attendance Recorded
```

## Kiosk Security

* Activation codes expire after a limited period.
* Kiosk tokens are stored as hashes.
* Disabled kiosks cannot access attendance code generation.
* Kiosk authentication is isolated from normal user authentication.
* Multiple kiosks are supported.

---

# 📢 Notices

The backend provides APIs for:

* Creating notices.
* Updating notices.
* Removing notices.
* Student notice access.
* Library announcements.

---

# 🔔 Notifications

Notification APIs support:

* User notifications.
* Notification retrieval.
* Notification management.

---

# 💬 Feedback & Complaints

The backend supports:

* Student feedback.
* Complaints.
* Feedback management.
* Staff/admin responses.

---

# 📊 Dashboard & Analytics

The backend provides data for:

* Dashboard statistics.
* Student statistics.
* Seat occupancy.
* Membership statistics.
* Attendance statistics.
* Payment information.
* Library analytics.

---

# 📈 Reports

Reporting functionality includes data for:

* Attendance.
* Memberships.
* Payments.
* Absentees.
* Library activity.

---

# 🛠️ Tech Stack

### Backend

* Node.js
* Express.js
* REST API
* JavaScript

### Database

* MongoDB
* Mongoose

### Authentication

* JWT
* bcrypt

### Payments

* Razorpay

### Development

* npm
* Nodemon
* Git
* GitHub

---

# 📁 Project Structure

```text
study-library-management-backend/
│
├── middleware/
│   ├── auth.js
│   ├── attendanceKiosk.js
│   └── ...
│
├── models/
│   ├── User.js
│   ├── Attendance.js
│   ├── AttendanceKiosk.js
│   ├── Membership.js
│   ├── Seat.js
│   ├── Plan.js
│   ├── Shift.js
│   └── ...
│
├── routes/
│   ├── auth.js
│   ├── attendance.js
│   ├── seats.js
│   ├── memberships.js
│   ├── payments.js
│   ├── notices.js
│   └── ...
│
├── utils/
│   ├── dates.js
│   ├── attendanceKiosk.js
│   └── ...
│
├── .env.example
├── .gitignore
├── package.json
├── seed.js
├── server.js
└── README.md
```

---

# 🚀 Getting Started

## Prerequisites

Install:

* Node.js
* npm
* MongoDB locally or MongoDB Atlas
* Git

---

# 1. Clone the Repository

```bash
git clone https://github.com/akabhishek2316/study-library-management-backend.git
```

Enter the project:

```bash
cd study-library-management-backend
```

---

# 2. Install Dependencies

```bash
npm install
```

---

# 3. Configure Environment Variables

Create a `.env` file using `.env.example`.

Example:

```env
PORT=5000

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_long_random_secret

OWNER_EMAIL=admin@example.com

OWNER_PASSWORD=change_this_password

RAZORPAY_KEY_ID=your_razorpay_key_id

RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

> Use the exact variables provided by the project's `.env.example` file.

Never commit `.env` to GitHub.

---

# 4. Seed Initial Data

If the seed script is configured:

```bash
npm run seed
```

The seed process can initialize development data such as:

* Owner account.
* Shifts.
* Plans.
* Seats.

Use development credentials only and change sensitive credentials before production use.

---

# 5. Start Development Server

```bash
npm run dev
```

Backend URL:

```text
http://localhost:5000
```

---

# 🏭 Production

Start the production server using:

```bash
npm start
```

The production API URL depends on the hosting environment.

---

# 🔗 API Architecture

The backend exposes REST APIs under the `/api` prefix.

Major API modules include:

```text
/api/auth
/api/students
/api/admissions
/api/seats
/api/shifts
/api/plans
/api/memberships
/api/payments
/api/attendance
/api/notices
/api/notifications
/api/feedback
/api/dashboard
/api/analytics
/api/reports
```

---

# 🔐 Authentication

Protected requests use JWT authentication:

```http
Authorization: Bearer <JWT_TOKEN>
```

The authentication middleware:

1. Reads the Bearer token.
2. Verifies the JWT.
3. Loads the user.
4. Checks account status.
5. Attaches the user to the request.
6. Applies role-based authorization where required.

---

# 🛡️ Security

The backend follows several security principles:

* Passwords are hashed using bcrypt.
* JWT secrets are stored in environment variables.
* Sensitive credentials are never stored in source code.
* Backend authorization is enforced independently of the frontend.
* Protected APIs require authentication.
* Role-based access is enforced server-side.
* Kiosk authentication is separate from user authentication.
* Kiosk tokens are stored as hashes.
* Payment verification is performed server-side.
* Admission and membership operations are validated by the backend.

---

# 🔗 Frontend

This API is consumed by the Study Library frontend.

👉 **[Frontend GitHub Repository](https://github.com/akabhishek2316/study-library-management)**

👉 **[Live Application](https://study-library-management.netlify.app/)**

---

# 🗺️ Development Roadmap

## Phase 1 — Core Management

* Authentication
* Role-based access
* Student management
* Seat management
* Hall and section management
* Shift management
* Plans
* Memberships
* Seat conflict validation
* Dashboard

## Phase 2 — Payments & Billing

* Payment records
* Online payments
* Razorpay integration
* Payment verification
* Receipts
* Membership payment tracking

## Phase 3 — QR Attendance

* QR attendance
* Student check-in
* GPS verification
* Attendance history
* Attendance reports
* Manual attendance
* Attendance kiosk

## Phase 4 — Student Experience

* PWA support
* Notices
* Notifications
* Feedback
* Complaints
* Student dashboard
* Seat change requests

## Phase 5 — Reports & Analytics

* Attendance analytics
* Membership analytics
* Payment information
* Seat occupancy
* Reports
* Dashboard improvements

---

# 🤝 Contributions

This project is currently under development.

Suggestions, bug reports, and feature improvements are welcome.



---

# 📄 License

No license has been specified yet.

All rights are reserved by default unless a license is added to the repository.

---

<p align="center">
  <strong>Study Library Management System</strong>
  <br />
  <em>Making library management simpler, smarter, and more organized.</em>
</p>
