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
    const [[{ totalUsers }]] = await db.query(
      "SELECT COUNT(*) as totalUsers FROM users WHERE account_status = 'active' OR account_status IS NULL"
    );
    const [[{ totalJobs }]] = await db.query('SELECT COUNT(*) as totalJobs FROM jobs');
    const [[{ activeJobs }]] = await db.query("SELECT COUNT(*) as activeJobs FROM jobs WHERE status = 'active'");
    const [[{ totalApplications }]] = await db.query('SELECT COUNT(*) as totalApplications FROM applications');
    const [[{ totalEmployers }]] = await db.query('SELECT COUNT(*) as totalEmployers FROM employers');
    const [[{ pendingEmployers }]] = await db.query(
      "SELECT COUNT(*) as pendingEmployers FROM employers WHERE verification_status = 'pending'"
    );
    const [[{ totalViews }]] = await db.query('SELECT SUM(views) as totalViews FROM jobs');
    const [[{ totalVisits }]] = await db.query('SELECT COUNT(*) as totalVisits FROM page_views');
    const [[{ totalUniqueVisitors }]] = await db.query(
      'SELECT COUNT(DISTINCT COALESCE(user_id, ip_address)) as totalUniqueVisitors FROM page_views'
    );

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
        totalVisits,
        totalUniqueVisitors,
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
  const { page = 1, limit = 20, role = '', account_status = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const clauses = [];

  if (role) {
    clauses.push('role = ?');
    params.push(role);
  }
  if (account_status === 'active' || account_status === 'removed') {
    clauses.push('account_status = ?');
    params.push(account_status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  try {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM users ${where}`, params);
    const [users] = await db.query(
      `SELECT id, name, email, role, account_status, removal_reason, removed_at, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ success: true, users, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/admin/users/:id/remove — soft-remove user (requires reason)
router.put('/users/:id/remove', async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body.reason || '').trim();

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot remove your own account.' });
  }
  if (!reason) {
    return res.status(400).json({ success: false, message: 'A reason is required to remove a user.' });
  }

  try {
    const [rows] = await db.query('SELECT id, role, account_status FROM users WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (rows[0].role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin accounts cannot be removed this way.' });
    }
    if (rows[0].account_status === 'removed') {
      return res.status(400).json({ success: false, message: 'This account is already removed.' });
    }

    await db.query(
      `UPDATE users
       SET account_status = 'removed', removal_reason = ?, removed_at = NOW()
       WHERE id = ?`,
      [reason, id]
    );

    res.json({ success: true, message: 'User account removed. They can no longer sign in.' });
  } catch (err) {
    console.error('Admin remove user error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE kept for compatibility — same as soft-remove, requires reason in body
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || '').trim();

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot remove your own account.' });
  }
  if (!reason) {
    return res.status(400).json({ success: false, message: 'A reason is required to remove a user.' });
  }

  try {
    const [rows] = await db.query('SELECT id, role, account_status FROM users WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    if (rows[0].role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin accounts cannot be removed this way.' });
    }

    await db.query(
      `UPDATE users
       SET account_status = 'removed', removal_reason = ?, removed_at = NOW()
       WHERE id = ?`,
      [reason, id]
    );
    res.json({ success: true, message: 'User account removed. They can no longer sign in.' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/jobs — list all jobs (including pending/rejected/past)
router.get('/jobs', async (req, res) => {
  // Don't block the response on auto-close
  closeExpiredJobs().catch(() => {});

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

    const engagement = await getEngagementSeries();

    res.json({ success: true, viewsPerDay, appsPerDay, mostApplied, engagement });
  } catch (err) {
    console.error('Admin analytics error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/**
 * Build daily/weekly/monthly rollups of pageviews, unique visitors, job (click) views, and CTR.
 * CTR = job_views (clicks into a job) / page_views (site pageviews) for the same bucket, as a %.
 */
async function getEngagementSeries() {
  const bucketQueries = {
    daily: {
      interval: 'DATE_SUB(NOW(), INTERVAL 30 DAY)',
      pvExpr: 'DATE(viewed_at)',
    },
    weekly: {
      interval: 'DATE_SUB(NOW(), INTERVAL 12 WEEK)',
      pvExpr: "DATE_FORMAT(viewed_at, '%x-W%v')",
    },
    monthly: {
      interval: 'DATE_SUB(NOW(), INTERVAL 12 MONTH)',
      pvExpr: "DATE_FORMAT(viewed_at, '%Y-%m')",
    },
  };

  const result = {};

  for (const [bucket, { interval, pvExpr }] of Object.entries(bucketQueries)) {
    const [pageViewRows] = await db.query(
      `SELECT ${pvExpr} as period, COUNT(*) as pageViews,
              COUNT(DISTINCT COALESCE(user_id, ip_address)) as uniqueVisitors
       FROM page_views
       WHERE viewed_at >= ${interval}
       GROUP BY period
       ORDER BY period`
    );

    const [jobViewRows] = await db.query(
      `SELECT ${pvExpr} as period, COUNT(*) as jobViews
       FROM job_views
       WHERE viewed_at >= ${interval}
       GROUP BY period
       ORDER BY period`
    );

    const jobViewsByPeriod = Object.fromEntries(jobViewRows.map(r => [r.period, r.jobViews]));

    result[bucket] = pageViewRows.map(row => {
      const jobViews = jobViewsByPeriod[row.period] || 0;
      return {
        period: row.period,
        pageViews: row.pageViews,
        uniqueVisitors: row.uniqueVisitors,
        jobViews,
        ctr: row.pageViews > 0 ? Number(((jobViews / row.pageViews) * 100).toFixed(2)) : 0,
      };
    });
  }

  return result;
}

module.exports = router;
