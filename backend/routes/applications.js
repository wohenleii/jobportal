const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdmin, requireEmployer } = require('../middleware/auth');
const { notifyApplicationStatus } = require('../utils/notifications');
const { closeExpiredJobs } = require('../utils/closeExpiredJobs');

// GET /api/applications/employer/stats — stats for employer dashboard
router.get('/employer/stats', authenticate, requireEmployer, async (req, res) => {
  try {
    try {
      await closeExpiredJobs();
    } catch (_) {}

    const empty = {
      totalJobs: 0,
      activeJobs: 0,
      pendingJobs: 0,
      rejectedJobs: 0,
      approvedJobs: 0,
      openJobs: 0,
      closingSoonCount: 0,
      totalApplications: 0,
      shortlisted: 0,
      statusBreakdown: {
        pending: 0,
        reviewed: 0,
        shortlisted: 0,
        rejected: 0,
        hired: 0,
      },
      recentApplications: [],
      closingSoon: [],
      topJobs: [],
    };

    const [empRows] = await db.query('SELECT id FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1', [req.user.id]);
    if (empRows.length === 0) {
      return res.json({ success: true, stats: empty });
    }
    const employerId = empRows[0].id;

    const [[{ totalJobs }]] = await db.query(
      'SELECT COUNT(*) as totalJobs FROM jobs WHERE employer_id = ?', [employerId]
    );
    const [[{ activeJobs }]] = await db.query(
      "SELECT COUNT(*) as activeJobs FROM jobs WHERE employer_id = ? AND status = 'active'", [employerId]
    );
    const [[{ pendingJobs }]] = await db.query(
      "SELECT COUNT(*) as pendingJobs FROM jobs WHERE employer_id = ? AND status = 'pending'", [employerId]
    );
    const [[{ rejectedJobs }]] = await db.query(
      "SELECT COUNT(*) as rejectedJobs FROM jobs WHERE employer_id = ? AND status = 'rejected'", [employerId]
    );
    const [[{ approvedJobs }]] = await db.query(
      "SELECT COUNT(*) as approvedJobs FROM jobs WHERE employer_id = ? AND status IN ('active', 'closed')",
      [employerId]
    );
    const [[{ openJobs }]] = await db.query(
      `SELECT COUNT(*) as openJobs FROM jobs
       WHERE employer_id = ? AND status = 'active'
         AND (deadline IS NULL OR deadline >= CURDATE())`,
      [employerId]
    );
    const [[{ totalApplications }]] = await db.query(
      `SELECT COUNT(*) as totalApplications FROM applications a
       JOIN jobs j ON a.job_id = j.id WHERE j.employer_id = ?`, [employerId]
    );
    const [[{ shortlisted }]] = await db.query(
      `SELECT COUNT(*) as shortlisted FROM applications a
       JOIN jobs j ON a.job_id = j.id WHERE j.employer_id = ? AND a.status = 'shortlisted'`, [employerId]
    );

    const [statusRows] = await db.query(
      `SELECT a.status, COUNT(*) as count
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE j.employer_id = ?
       GROUP BY a.status`,
      [employerId]
    );
    const statusBreakdown = {
      pending: 0,
      reviewed: 0,
      shortlisted: 0,
      rejected: 0,
      hired: 0,
    };
    statusRows.forEach((r) => {
      if (Object.prototype.hasOwnProperty.call(statusBreakdown, r.status)) {
        statusBreakdown[r.status] = r.count;
      }
    });

    const [recentApplications] = await db.query(
      `SELECT a.id, a.status, a.applied_at, a.job_id,
              u.name as applicant_name, u.email as applicant_email, u.skills, u.resume_url, u.bio,
              j.title as job_title, j.job_type
       FROM applications a
       JOIN users u ON a.user_id = u.id
       JOIN jobs j ON a.job_id = j.id
       WHERE j.employer_id = ?
       ORDER BY a.applied_at DESC
       LIMIT 8`,
      [employerId]
    );

    const [closingSoon] = await db.query(
      `SELECT j.id, j.title, j.deadline, j.views, j.job_type, j.status,
              (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as application_count,
              DATEDIFF(j.deadline, CURDATE()) as days_left
       FROM jobs j
       WHERE j.employer_id = ?
         AND j.status = 'active'
         AND j.deadline IS NOT NULL
         AND j.deadline >= CURDATE()
         AND j.deadline <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       ORDER BY j.deadline ASC
       LIMIT 8`,
      [employerId]
    );

    const [topJobs] = await db.query(
      `SELECT j.id, j.title, j.views, j.status, j.deadline, j.job_type, j.created_at,
              (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as application_count
       FROM jobs j
       WHERE j.employer_id = ?
       ORDER BY j.views DESC, application_count DESC
       LIMIT 5`,
      [employerId]
    );

    res.json({
      success: true,
      stats: {
        totalJobs,
        activeJobs,
        pendingJobs,
        rejectedJobs,
        approvedJobs,
        openJobs,
        closingSoonCount: closingSoon.length,
        totalApplications,
        shortlisted,
        statusBreakdown,
        recentApplications,
        closingSoon,
        topJobs,
      },
    });
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
      `SELECT a.*, u.name as applicant_name, u.email as applicant_email, u.skills, u.resume_url, u.bio,
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
    try {
      await closeExpiredJobs();
    } catch (_) {}

    const [rows] = await db.query(
      `SELECT a.*, j.title, j.location, j.job_type, j.status AS job_status, j.deadline,
              e.company_name
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

// GET /api/applications/job/:jobId — get applications for a job (employer owns it, or admin)
router.get('/job/:jobId', authenticate, requireEmployer, async (req, res) => {
  const { jobId } = req.params;
  try {
    const [jobRows] = await db.query('SELECT id, employer_id FROM jobs WHERE id = ?', [jobId]);
    if (jobRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    if (req.user.role !== 'admin') {
      const [empRows] = await db.query(
        'SELECT id FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1',
        [req.user.id]
      );
      if (empRows.length === 0 || empRows[0].id !== jobRows[0].employer_id) {
        return res.status(403).json({ success: false, message: 'Not authorized to view applications for this job.' });
      }
    }

    const [rows] = await db.query(
      `SELECT a.*, u.name, u.email, u.skills, u.resume_url, u.bio
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
    try {
      await closeExpiredJobs();
    } catch (_) {}

    const [userRows] = await db.query(
      'SELECT name, bio, skills, resume_url FROM users WHERE id = ?',
      [req.user.id]
    );
    const student = userRows[0] || {};
    const missing = [];
    if (!String(student.name || '').trim()) missing.push('full name');
    if (!String(student.bio || '').trim()) missing.push('bio');
    if (!String(student.skills || '').trim()) missing.push('skills');
    if (!String(student.resume_url || '').trim()) missing.push('resume (PDF upload or link)');
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Please complete your profile before applying (${missing.join(', ')}).`,
        code: 'PROFILE_INCOMPLETE',
        missing,
      });
    }

    const [jobRows] = await db.query(
      'SELECT id, status, deadline FROM jobs WHERE id = ?',
      [jobId]
    );
    if (jobRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }
    const job = jobRows[0];
    const deadlinePassed =
      job.deadline && new Date(job.deadline) < new Date(new Date().toDateString());

    if (job.status === 'closed' || deadlinePassed) {
      return res.status(400).json({
        success: false,
        message: 'This job has been closed. Applications are no longer accepted.',
      });
    }
    if (job.status !== 'active') {
      return res.status(400).json({ success: false, message: 'This job is not open for applications.' });
    }

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

// PUT /api/applications/:id/status — update application status (employer owns job, or admin)
router.put('/:id/status', authenticate, requireEmployer, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  try {
    const [appRows] = await db.query(
      `SELECT a.id, j.employer_id
       FROM applications a
       JOIN jobs j ON a.job_id = j.id
       WHERE a.id = ?`,
      [id]
    );
    if (appRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    if (req.user.role !== 'admin') {
      const [empRows] = await db.query(
        'SELECT id FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1',
        [req.user.id]
      );
      if (empRows.length === 0 || empRows[0].id !== appRows[0].employer_id) {
        return res.status(403).json({ success: false, message: 'Not authorized to update this application.' });
      }
    }

    await db.query('UPDATE applications SET status = ? WHERE id = ?', [status, id]);
    try {
      await notifyApplicationStatus(id, status);
    } catch (notifyErr) {
      console.error('Application status notification error:', notifyErr);
    }
    res.json({ success: true, message: 'Application status updated.' });
  } catch (err) {
    console.error('Update application status error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
