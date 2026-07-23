const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Optionally decode a bearer token without requiring one — pageviews are public
function optionalUserId(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).id;
  } catch (_) {
    return null;
  }
}

// POST /api/analytics/pageview — beacon hit from public pages
router.post('/pageview', async (req, res) => {
  const { path } = req.body;
  if (!path || typeof path !== 'string') {
    return res.status(400).json({ success: false, message: 'Path is required.' });
  }
  try {
    const userId = optionalUserId(req);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await db.query(
      'INSERT INTO page_views (path, user_id, ip_address) VALUES (?, ?, ?)',
      [path.slice(0, 255), userId, ip]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Pageview tracking error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
