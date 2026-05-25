const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/bookmarks — get user's bookmarked jobs
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT j.*, e.company_name, e.company_logo, b.created_at as bookmarked_at
       FROM bookmarks b
       JOIN jobs j ON b.job_id = j.id
       JOIN employers e ON j.employer_id = e.id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, bookmarks: rows });
  } catch (err) {
    console.error('Get bookmarks error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/bookmarks/:jobId — add bookmark
router.post('/:jobId', authenticate, async (req, res) => {
  const { jobId } = req.params;
  try {
    await db.query(
      'INSERT IGNORE INTO bookmarks (user_id, job_id) VALUES (?, ?)',
      [req.user.id, jobId]
    );
    res.json({ success: true, message: 'Job bookmarked.' });
  } catch (err) {
    console.error('Add bookmark error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/bookmarks/:jobId — remove bookmark
router.delete('/:jobId', authenticate, async (req, res) => {
  const { jobId } = req.params;
  try {
    await db.query(
      'DELETE FROM bookmarks WHERE user_id = ? AND job_id = ?',
      [req.user.id, jobId]
    );
    res.json({ success: true, message: 'Bookmark removed.' });
  } catch (err) {
    console.error('Remove bookmark error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/bookmarks/check/:jobId — check if job is bookmarked
router.get('/check/:jobId', authenticate, async (req, res) => {
  const { jobId } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT id FROM bookmarks WHERE user_id = ? AND job_id = ?',
      [req.user.id, jobId]
    );
    res.json({ success: true, bookmarked: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
