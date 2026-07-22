const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { notifyJobAlerts } = require('../utils/notifications');
const { closeExpiredJobs } = require('../utils/closeExpiredJobs');

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/stats — dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) as totalUsers FROM users');
    const [[{ totalJobs }]] = await db.query('SELECT COUNT(*) as totalJobs FROM jobs');
    const [[{ activeJobs }]] = await db.query("SELECT COUNT(*) as activeJobs FROM jobs WHERE status = 'active'");
    const [[{ totalApplications }]] = await db.query('SELECT COUNT(*) as totalApplications FROM applications');
    const [[{ totalEmployers }]] = await db.query('SELECT COUNT(*) as totalEmployers FROM employers');
    const [[{ pendingEmployers }]] = await db.query(
      "SELECT COUNT(*) as pendingEmployers FROM employers WHERE verification_status = 'pending'"
    );
    const [[{ totalViews }]] = await db.query('SELECT SUM(views) as totalViews FROM jobs');

    // Jobs by category
    const [jobsByCategory] = await db.query(
      'SELECT category, COUNT(*) as count FROM jobs GROUP BY category ORDER BY count DESC LIMIT 8'
    );

    // Jobs by type
    const [jobsByType] = await db.query(
      'SELECT job_type, COUNT(*) as count FROM jobs GROUP BY job_type'
    );

    // Recent registrations (last 7 days)
    const [recentUsers] = await db.query(
      'SELECT DATE(created_at) as date, COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY date'
    );

    // Top viewed jobs
    const [topJobs] = await db.query(
      `SELECT j.id, j.title, j.views, e.company_name
       FROM jobs j JOIN employers e ON j.employer_id = e.id
       ORDER BY j.views DESC LIMIT 5`
    );

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalJobs,
        activeJobs,
        totalApplications,
        totalEmployers,
        pendingEmployers,
        totalViews: totalViews || 0,
      },
      jobsByCategory,
      jobsByType,
      recentUsers,
      topJobs,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/employers — list companies for verification
router.get('/employers', async (req, res) => {
  const { page = 1, limit = 20, status = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = '';

  if (status) {
    where = 'WHERE e.verification_status = ?';
    params.push(status);
  }

  try {
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM employers e ${where}`,
      params
    );
    const [employers] = await db.query(
      `SELECT e.id, e.company_name, e.company_website, e.company_description, e.industry, e.location,
              e.verification_status, e.rejection_reason, e.verified_at, e.created_at,
              u.id as user_id, u.name as contact_name, u.email as contact_email
       FROM employers e
       JOIN users u ON e.user_id = u.id
       ${where}
       ORDER BY
         CASE e.verification_status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
         e.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({
      success: true,
      employers,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    console.error('Admin get employers error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/admin/employers/:id/status — approve or reject company
router.put('/employers/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, rejection_reason = '' } = req.body;
  const validStatuses = ['pending', 'approved', 'rejected'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status. Use pending, approved, or rejected.' });
  }

  if (status === 'rejected' && !String(rejection_reason).trim()) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
  }

  try {
    const [rows] = await db.query('SELECT id FROM employers WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employer not found.' });
    }

    if (status === 'approved') {
      await db.query(
        `UPDATE employers
         SET verification_status = 'approved', rejection_reason = NULL, verified_at = NOW()
         WHERE id = ?`,
        [id]
      );
      return res.json({ success: true, message: 'Company approved.' });
    }

    if (status === 'rejected') {
      await db.query(
        `UPDATE employers
         SET verification_status = 'rejected', rejection_reason = ?, verified_at = NULL
         WHERE id = ?`,
        [String(rejection_reason).trim(), id]
      );
      return res.json({ success: true, message: 'Company rejected.' });
    }

    await db.query(
      `UPDATE employers
       SET verification_status = 'pending', rejection_reason = NULL, verified_at = NULL
       WHERE id = ?`,
      [id]
    );
    res.json({ success: true, message: 'Company set back to pending.' });
  } catch (err) {
    console.error('Admin update employer status error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  const { page = 1, limit = 20, role = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = '';

  if (role) {
    where = 'WHERE role = ?';
    params.push(role);
  }

  try {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM users ${where}`, params);
    const [users] = await db.query(
      `SELECT id, name, email, role, created_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ success: true, users, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/admin/users/:id — delete user
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
  }
  try {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/jobs — list all jobs (including pending/rejected/past)
router.get('/jobs', async (req, res) => {
  try {
    await closeExpiredJobs();
  } catch (_) {}

  const { page = 1, limit = 20, status = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const clauses = [];

  if (status === 'past') {
    clauses.push("(j.status = 'closed' OR (j.deadline IS NOT NULL AND j.deadline < CURDATE()))");
  } else if (status) {
    clauses.push('j.status = ?');
    params.push(status);
    // Keep current filters focused on jobs that are still open
    clauses.push('(j.deadline IS NULL OR j.deadline >= CURDATE())');
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  try {
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM jobs j ${where}`, params
    );
    const [jobs] = await db.query(
      `SELECT j.*, e.company_name FROM jobs j JOIN employers e ON j.employer_id = e.id
       ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ success: true, jobs, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Admin get jobs error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/admin/jobs/:id/status — approve, reject, close, or set pending
router.put('/jobs/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, rejection_reason = '' } = req.body;
  const validStatuses = ['active', 'closed', 'pending', 'rejected'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  if (status === 'rejected' && !String(rejection_reason).trim()) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
  }

  try {
    const [rows] = await db.query('SELECT id FROM jobs WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    if (status === 'rejected') {
      await db.query(
        'UPDATE jobs SET status = ?, rejection_reason = ? WHERE id = ?',
        ['rejected', String(rejection_reason).trim(), id]
      );
      return res.json({ success: true, message: 'Job rejected.' });
    }

    if (status === 'active') {
      await db.query(
        'UPDATE jobs SET status = ?, rejection_reason = NULL WHERE id = ?',
        ['active', id]
      );
      try {
        await notifyJobAlerts(id);
      } catch (notifyErr) {
        console.error('Job alert notification error:', notifyErr);
      }
      return res.json({ success: true, message: 'Job approved.' });
    }

    await db.query(
      'UPDATE jobs SET status = ?, rejection_reason = NULL WHERE id = ?',
      [status, id]
    );
    res.json({ success: true, message: `Job status updated to ${status}.` });
  } catch (err) {
    console.error('Admin update job status error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/analytics — job view analytics
router.get('/analytics', async (req, res) => {
  try {
    // Views per day (last 30 days)
    const [viewsPerDay] = await db.query(
      `SELECT DATE(viewed_at) as date, COUNT(*) as views
       FROM job_views
       WHERE viewed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(viewed_at)
       ORDER BY date`
    );

    // Applications per day (last 30 days)
    const [appsPerDay] = await db.query(
      `SELECT DATE(applied_at) as date, COUNT(*) as applications
       FROM applications
       WHERE applied_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(applied_at)
       ORDER BY date`
    );

    // Most applied jobs
    const [mostApplied] = await db.query(
      `SELECT j.id, j.title, e.company_name, COUNT(a.id) as application_count
       FROM jobs j
       JOIN employers e ON j.employer_id = e.id
       LEFT JOIN applications a ON j.id = a.job_id
       GROUP BY j.id
       ORDER BY application_count DESC
       LIMIT 10`
    );

    res.json({ success: true, viewsPerDay, appsPerDay, mostApplied });
  } catch (err) {
    console.error('Admin analytics error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
