require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure upload directories exist
fs.mkdirSync(path.join(__dirname, '../uploads/resumes'), { recursive: true });

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));
// Serve uploaded resumes
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/bookmarks', require('./routes/bookmarks'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/analytics', require('./routes/analytics'));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Job Portal API is running.', timestamp: new Date() });
});

// ── Catch-all: serve frontend for any non-API route ─────────────────────────
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Job Portal server running on http://localhost:${PORT}`);

  // Auto-close jobs past their application deadline
  const { closeExpiredJobs } = require('./utils/closeExpiredJobs');
  const runCloseExpired = () => {
    closeExpiredJobs()
      .then((n) => {
        if (n > 0) console.log(`Closed ${n} job(s) past application deadline.`);
      })
      .catch((err) => console.error('closeExpiredJobs error:', err.message));
  };
  runCloseExpired();
  setInterval(runCloseExpired, 60 * 60 * 1000); // hourly
});
