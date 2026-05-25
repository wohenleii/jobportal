# JobPortal — Full-Stack Job Portal

A complete job portal built with Node.js, Express, MySQL, and Bootstrap.

## Tech Stack

- **Frontend**: HTML, CSS, Bootstrap 5, Vanilla JavaScript
- **Backend**: Node.js + Express
- **Database**: MySQL (mysql2)
- **Auth**: JWT + bcrypt
- **Charts**: Chart.js (admin dashboard)

## Project Structure

```
jobportal/
├── backend/
│   ├── config/db.js          # MySQL connection pool
│   ├── middleware/auth.js     # JWT middleware
│   ├── routes/
│   │   ├── auth.js           # Login, register, profile
│   │   ├── jobs.js           # Job CRUD + search/filter
│   │   ├── bookmarks.js      # Bookmark jobs
│   │   ├── applications.js   # Apply for jobs
│   │   └── admin.js          # Admin dashboard APIs
│   ├── scripts/setup-db.js   # DB setup script
│   ├── server.js             # Express entry point
│   └── .env                  # Environment variables
├── frontend/
│   ├── css/style.css         # Custom styles
│   ├── js/api.js             # API client + helpers
│   ├── index.html            # Home page
│   ├── login.html            # Login page
│   ├── register.html         # Register page
│   ├── jobs.html             # Job listings + search/filter
│   ├── profile.html          # User profile + applications + bookmarks
│   ├── post-job.html         # Employer job submission form
│   └── admin.html            # Admin dashboard
└── database/
    ├── schema.sql            # Table definitions
    └── seed.sql              # Sample data
```

## Quick Start

### 1. Configure environment

Edit `backend/.env` with your MySQL credentials:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=jobportal
JWT_SECRET=change_this_secret
```

### 2. Set up the database

```bash
npm run setup-db
```

This creates all tables and inserts sample data.

### 3. Start the server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Open **http://localhost:5000** in your browser.

## Demo Accounts

| Role     | Email                      | Password     |
|----------|----------------------------|--------------|
| Admin    | admin@jobportal.com        | admin123     |
| Employer | employer@techcorp.com      | employer123  |

Register a new **student** account to test job applications and bookmarks.

## Features

| Feature                  | Details                                              |
|--------------------------|------------------------------------------------------|
| Authentication           | JWT-based login/register with bcrypt password hashing |
| Role-based access        | Student, Employer, Admin roles                       |
| Job listings             | Paginated list with search + multi-filter            |
| Job detail modal         | Full job info with apply button                      |
| Bookmark jobs            | Save/unsave jobs, view in profile                    |
| Apply for jobs           | Submit application with cover letter                 |
| Employer job posting     | Full job submission form                             |
| Admin dashboard          | Stats, user management, job management               |
| Analytics                | Views/applications over time, top jobs charts        |
| Job view tracking        | Tracks views per job with IP + user                  |

## API Endpoints

### Auth
- `POST /api/auth/register` — Register
- `POST /api/auth/login` — Login
- `GET  /api/auth/me` — Get current user
- `PUT  /api/auth/profile` — Update profile

### Jobs
- `GET  /api/jobs` — List jobs (search, filter, paginate)
- `GET  /api/jobs/:id` — Get job detail
- `POST /api/jobs` — Create job (employer)
- `PUT  /api/jobs/:id` — Update job (employer)
- `DELETE /api/jobs/:id` — Delete job (admin)

### Bookmarks
- `GET  /api/bookmarks` — Get my bookmarks
- `POST /api/bookmarks/:jobId` — Add bookmark
- `DELETE /api/bookmarks/:jobId` — Remove bookmark

### Applications
- `POST /api/applications/:jobId` — Apply for job
- `GET  /api/applications/my` — My applications

### Admin
- `GET  /api/admin/stats` — Dashboard stats
- `GET  /api/admin/users` — List users
- `DELETE /api/admin/users/:id` — Delete user
- `GET  /api/admin/jobs` — List all jobs
- `PUT  /api/admin/jobs/:id/status` — Update job status
- `GET  /api/admin/analytics` — Analytics data
