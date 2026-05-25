const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT token from Authorization header.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
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
