const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdmin, requireEmployer } = require('../middleware/auth');

// GET /api/applications/employer/stats — stats for employer dashboard
router.get('/employer/stats', authenticate, requireEmployer, async (req, res) => {
  try {
    const [empRows] = await db.query('SELECT id FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1', [req.user.id]);
    if (empRows.length === 0) {
      // No employer profile — return zeros instead of erroring
      return res.json({ success: true, stats: { totalJobs: 0, activeJobs: 0, totalApplications: 0, shortlisted: 0 } });
    }
    const employerId = empRows[0].id;

    const [[{ totalJobs }]] = await db.query(
      'SELECT COUNT(*) as totalJobs FROM jobs WHERE employer_id = ?', [employerId]
    );
    const [[{ activeJobs }]] = await db.query(
      "SELECT COUNT(*) as activeJobs FROM jobs WHERE employer_id = ? AND status = 'active'", [employerId]
    );
    const [[{ totalApplications }]] = await db.query(
      `SELECT COUNT(*) as totalApplications FROM applications a
       JOIN jobs j ON a.job_id = j.id WHERE j.employer_id = ?`, [employerId]
    );
    const [[{ shortlisted }]] = await db.query(
      `SELECT COUNT(*) as shortlisted FROM applications a
       JOIN jobs j ON a.job_id = j.id WHERE j.employer_id = ? AND a.status = 'shortlisted'`, [employerId]
    );

    res.json({ success: true, stats: { totalJobs, activeJobs, totalApplications, shortlisted } });
  } catch (err) {
    console.error('Employer stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/applications/employer — get all applications for employer's jobs
router.get('/employer', authenticate, requireEmployer, async (req, res) => {
  try {
    const [empRows] = await db.query('SELECT id FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1', [req.user.id]);
    if (empRows.length === 0) {
      return res.json({ success: true, applications: [] });
    }
    const employerId = empRows[0].id;

    const [rows] = await db.query(
      `SELECT a.*, u.name as applicant_name, u.email as applicant_email, u.skills, u.resume_url,
              j.title as job_title, j.job_type
       FROM applications a
       JOIN users u ON a.user_id = u.id
       JOIN jobs j ON a.job_id = j.id
       WHERE j.employer_id = ?
       ORDER BY a.applied_at DESC`,
      [employerId]
    );
    res.json({ success: true, applications: rows });
  } catch (err) {
    console.error('Get employer applications error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/applications/my — get current user's applications
router.get('/my', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, j.title, j.location, j.job_type, e.company_name
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       JOIN employers e ON j.employer_id = e.id
       WHERE a.user_id = ?
       ORDER BY a.applied_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, applications: rows });
  } catch (err) {
    console.error('Get my applications error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/applications/job/:jobId — get applications for a job (employer/admin)
router.get('/job/:jobId', authenticate, requireEmployer, async (req, res) => {
  const { jobId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT a.*, u.name, u.email, u.skills, u.resume_url
       FROM applications a
       JOIN users u ON a.user_id = u.id
       WHERE a.job_id = ?
       ORDER BY a.applied_at DESC`,
      [jobId]
    );
    res.json({ success: true, applications: rows });
  } catch (err) {
    console.error('Get job applications error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/applications/:jobId — apply for a job
router.post('/:jobId', authenticate, async (req, res) => {
  const { jobId } = req.params;
  const { cover_letter } = req.body;

  if (req.user.role !== 'student') {
    return res.status(403).json({ success: false, message: 'Only students can apply for jobs.' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM applications WHERE user_id = ? AND job_id = ?',
      [req.user.id, jobId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'You have already applied for this job.' });
    }

    await db.query(
      'INSERT INTO applications (user_id, job_id, cover_letter) VALUES (?, ?, ?)',
      [req.user.id, jobId, cover_letter || null]
    );

    res.status(201).json({ success: true, message: 'Application submitted successfully.' });
  } catch (err) {
    console.error('Apply error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/applications/:id/status — update application status (employer/admin)
router.put('/:id/status', authenticate, requireEmployer, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  try {
    await db.query('UPDATE applications SET status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, message: 'Application status updated.' });
  } catch (err) {
    console.error('Update application status error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
