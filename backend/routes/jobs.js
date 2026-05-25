const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireEmployer, requireAdmin } = require('../middleware/auth');

// GET /api/jobs — list jobs with search + filter
router.get('/', async (req, res) => {
  const {
    search = '',
    category = '',
    job_type = '',
    location = '',
    salary_min = '',
    salary_max = '',
    page = 1,
    limit = 10,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  let where = 'WHERE j.status = "active"';

  if (search) {
    where += ' AND (j.title LIKE ? OR j.description LIKE ? OR e.company_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    where += ' AND j.category = ?';
    params.push(category);
  }
  if (job_type) {
    where += ' AND j.job_type = ?';
    params.push(job_type);
  }
  if (location) {
    where += ' AND j.location LIKE ?';
    params.push(`%${location}%`);
  }
  if (salary_min) {
    where += ' AND j.salary_min >= ?';
    params.push(parseFloat(salary_min));
  }
  if (salary_max) {
    where += ' AND j.salary_max <= ?';
    params.push(parseFloat(salary_max));
  }

  try {
    const [countRows] = await db.query(
      `SELECT COUNT(*) as total FROM jobs j JOIN employers e ON j.employer_id = e.id ${where}`,
      params
    );
    const total = countRows[0].total;

    const [jobs] = await db.query(
      `SELECT j.*, e.company_name, e.company_logo, e.location as company_location
       FROM jobs j
       JOIN employers e ON j.employer_id = e.id
       ${where}
       ORDER BY j.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      jobs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Get jobs error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/jobs/categories — get distinct categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT DISTINCT category FROM jobs WHERE category IS NOT NULL AND status = "active" ORDER BY category'
    );
    res.json({ success: true, categories: rows.map(r => r.category) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/jobs/:id — get single job
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT j.*, e.company_name, e.company_logo, e.company_website, e.company_description, e.industry, e.location as company_location
       FROM jobs j
       JOIN employers e ON j.employer_id = e.id
       WHERE j.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    // Track view
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userId = req.user ? req.user.id : null;
    await db.query(
      'INSERT INTO job_views (job_id, user_id, ip_address) VALUES (?, ?, ?)',
      [id, userId, ip]
    );
    await db.query('UPDATE jobs SET views = views + 1 WHERE id = ?', [id]);

    res.json({ success: true, job: rows[0] });
  } catch (err) {
    console.error('Get job error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/jobs — create job (employer/admin)
router.post('/', authenticate, requireEmployer, async (req, res) => {
  const {
    title, description, requirements, location, job_type,
    category, salary_min, salary_max, deadline,
  } = req.body;

  if (!title || !description || !location) {
    return res.status(400).json({ success: false, message: 'Title, description, and location are required.' });
  }

  try {
    // Get employer id for this user
    const [empRows] = await db.query('SELECT id FROM employers WHERE user_id = ?', [req.user.id]);
    if (empRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Employer profile not found.' });
    }

    const [result] = await db.query(
      `INSERT INTO jobs (employer_id, title, description, requirements, location, job_type, category, salary_min, salary_max, deadline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [empRows[0].id, title, description, requirements, location, job_type, category, salary_min || null, salary_max || null, deadline || null]
    );

    res.status(201).json({ success: true, message: 'Job posted successfully.', jobId: result.insertId });
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/jobs/:id — update job
router.put('/:id', authenticate, requireEmployer, async (req, res) => {
  const { id } = req.params;
  const { title, description, requirements, location, job_type, category, salary_min, salary_max, deadline, status } = req.body;

  try {
    await db.query(
      `UPDATE jobs SET title=?, description=?, requirements=?, location=?, job_type=?, category=?, salary_min=?, salary_max=?, deadline=?, status=?
       WHERE id=?`,
      [title, description, requirements, location, job_type, category, salary_min || null, salary_max || null, deadline || null, status, id]
    );
    res.json({ success: true, message: 'Job updated successfully.' });
  } catch (err) {
    console.error('Update job error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/jobs/:id — delete job (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM jobs WHERE id = ?', [id]);
    res.json({ success: true, message: 'Job deleted successfully.' });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
