const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const JOB_INTEREST_CATEGORIES = [
  'Software & IT',
  'Sales',
  'Marketing',
  'Accounting & Finance',
  'Human Resources',
  'Customer Service',
  'Administration',
  'Engineering',
  'Design',
  'Operations',
  'Healthcare',
  'Education',
  'Other',
];

const resumeDir = path.join(__dirname, '../../uploads/resumes');
fs.mkdirSync(resumeDir, { recursive: true });

const resumeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, resumeDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `user-${req.user.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      path.extname(file.originalname).toLowerCase() === '.pdf';
    if (!ok) return cb(new Error('Only PDF resumes are allowed.'));
    cb(null, true);
  },
});

function normalizeInterestFields(input) {
  let list = [];
  if (Array.isArray(input)) {
    list = input.map((s) => String(s).trim()).filter(Boolean);
  } else if (typeof input === 'string') {
    list = input.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const unique = [...new Set(list)];
  const invalid = unique.filter((c) => !JOB_INTEREST_CATEGORIES.includes(c));
  if (invalid.length) {
    return { error: `Invalid interest field(s): ${invalid.join(', ')}` };
  }
  return { value: unique.join(',') || null };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'student' } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  // Only allow student or employer self-registration
  const allowedRoles = ['student', 'employer'];
  const userRole = allowedRoles.includes(role) ? role : 'student';

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, userRole]
    );

    // If employer, create employer profile (pending admin verification)
    if (userRole === 'employer') {
      const { company_name = 'My Company', industry = '', location = '' } = req.body;
      await db.query(
        `INSERT INTO employers (user_id, company_name, industry, location, verification_status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [result.insertId, company_name, industry, location]
      );
    }

    const token = jwt.sign(
      { id: result.insertId, email, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: { id: result.insertId, name, email, role: userRole },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// GET /api/auth/interest-categories — fields of interest for job alerts
router.get('/interest-categories', (_req, res) => {
  res.json({ success: true, categories: JOB_INTEREST_CATEGORIES });
});

// GET /api/auth/me — get current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, avatar, bio, skills, resume_url, interest_fields, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = rows[0];
    user.interest_fields_list = user.interest_fields
      ? String(user.interest_fields).split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    res.json({ success: true, user });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/auth/profile — update profile
router.put('/profile', authenticate, async (req, res) => {
  const { name, bio, skills, resume_url, interest_fields } = req.body;
  try {
    let interestsValue = undefined;
    if (interest_fields !== undefined) {
      const normalized = normalizeInterestFields(interest_fields);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }
      interestsValue = normalized.value;
    }

    if (interestsValue !== undefined) {
      await db.query(
        'UPDATE users SET name = ?, bio = ?, skills = ?, resume_url = ?, interest_fields = ? WHERE id = ?',
        [name, bio, skills, resume_url, interestsValue, req.user.id]
      );
    } else {
      await db.query(
        'UPDATE users SET name = ?, bio = ?, skills = ?, resume_url = ? WHERE id = ?',
        [name, bio, skills, resume_url, req.user.id]
      );
    }
    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/auth/resume — upload PDF resume (students)
router.post('/resume', authenticate, (req, res) => {
  resumeUpload.single('resume')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select a PDF file to upload.' });
    }

    try {
      const resumeUrl = `/uploads/resumes/${req.file.filename}`;

      // Remove previous uploaded resume file if it was stored locally
      const [rows] = await db.query('SELECT resume_url FROM users WHERE id = ?', [req.user.id]);
      const prev = rows[0]?.resume_url;
      if (prev && prev.startsWith('/uploads/resumes/')) {
        const prevPath = path.join(__dirname, '../..', prev);
        fs.promises.unlink(prevPath).catch(() => {});
      }

      await db.query('UPDATE users SET resume_url = ? WHERE id = ?', [resumeUrl, req.user.id]);
      res.json({
        success: true,
        message: 'Resume uploaded successfully.',
        resume_url: resumeUrl,
      });
    } catch (uploadErr) {
      console.error('Resume upload error:', uploadErr);
      res.status(500).json({ success: false, message: 'Server error during upload.' });
    }
  });
});

// GET /api/auth/employer-profile — get employer company profile
router.get('/employer-profile', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.json({ success: true, profile: null });
    }
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error('Get employer profile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/auth/employer-profile — update employer company profile
router.put('/employer-profile', authenticate, async (req, res) => {
  const { company_name, company_description, industry, location, company_website } = req.body;

  if (!company_name || !String(company_name).trim()) {
    return res.status(400).json({ success: false, message: 'Company name is required.' });
  }

  const allowedIndustries = [
    'Information Technology',
    'Banking & Finance',
    'Healthcare',
    'Education',
    'Retail & E-commerce',
    'Engineering & Manufacturing',
    'Construction & Real Estate',
    'Hospitality & Tourism',
    'Transportation & Logistics',
    'Government',
    'Media & Marketing',
    'Other',
  ];
  const allowedLocations = ['Islandwide', 'North', 'South', 'East', 'West', 'Central'];

  if (industry && !allowedIndustries.includes(industry)) {
    return res.status(400).json({ success: false, message: 'Invalid industry selected.' });
  }
  if (location && !allowedLocations.includes(location)) {
    return res.status(400).json({ success: false, message: 'Location must be a Singapore region.' });
  }

  const website = company_website ? String(company_website).trim() : '';
  if (website && !/^https?:\/\//i.test(website)) {
    return res.status(400).json({ success: false, message: 'Website must start with http:// or https://' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Employer profile not found.' });
    }
    // Employers may update their profile while pending/rejected/approved
    await db.query(
      'UPDATE employers SET company_name=?, company_description=?, industry=?, location=?, company_website=? WHERE id=?',
      [
        String(company_name).trim(),
        company_description ? String(company_description).trim() : null,
        industry || null,
        location || null,
        website || null,
        rows[0].id,
      ]
    );
    res.json({ success: true, message: 'Company profile updated successfully.' });
  } catch (err) {
    console.error('Update employer profile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
