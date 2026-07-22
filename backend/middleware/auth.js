const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * Middleware to verify JWT token from Authorization header.
 * Also blocks removed (invalid) accounts.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    try {
      const [rows] = await db.query(
        'SELECT id, role, account_status FROM users WHERE id = ?',
        [decoded.id]
      );
      if (!rows.length || rows[0].account_status === 'removed') {
        return res.status(403).json({
          success: false,
          message: 'This account is invalid.',
          code: 'ACCOUNT_INVALID',
        });
      }
      req.user = { id: rows[0].id, email: decoded.email, role: rows[0].role };
    } catch (dbErr) {
      // If column missing on old DB, fall back to token payload
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        req.user = decoded;
      } else {
        throw dbErr;
      }
    }

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
    console.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * Middleware to restrict access to admin role only.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
  }
  next();
};

/**
 * Middleware to restrict access to employer role only.
 */
const requireEmployer = (req, res, next) => {
  if (!req.user || (req.user.role !== 'employer' && req.user.role !== 'admin')) {
    return res.status(403).json({ success: false, message: 'Access denied. Employers only.' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireEmployer };
