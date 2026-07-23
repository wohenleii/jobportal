const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireEmployer, requireAdmin } = require('../middleware/auth');
const { notifyJobAlerts } = require('../utils/notifications');
const { closeExpiredJobs } = require('../utils/closeExpiredJobs');

// GET /api/jobs — list jobs with search + filter + sort
router.get('/', async (req, res) => {
  try {
    await closeExpiredJobs();
  } catch (_) {}

  const {
    search = '',
    category = '',
    job_type = '',
    location = '',
    company = '',
    salary_min = '',
    salary_max = '',
    sort = 'newest',
    page = 1,
    limit = 10,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  // Only open (active + not past deadline) jobs on the public site
  let where = "WHERE j.status = 'active' AND (j.deadline IS NULL OR j.deadline >= CURDATE())";

  if (search) {
    where += ' AND (j.title LIKE ? OR j.description LIKE ? OR e.company_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    where += ' AND j.category = ?';
    params.push(category);
  }
  if (job_type) {
    const types = job_type.split(',').filter(Boolean);
    if (types.length === 1) {
      where += ' AND j.job_type = ?';
      params.push(types[0]);
    } else if (types.length > 1) {
      where += ` AND j.job_type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }
  }
  if (company) {
    where += ' AND e.company_name = ?';
    params.push(company);
  }
  // Region-based location filter
  if (location) {
    const regionMap = {
      north: ['north', 'woodlands', 'yishun', 'sembawang', 'admiralty', 'marsiling', 'canberra'],
      south: ['south', 'harbourfront', 'sentosa', 'telok blangah', 'buona vista', 'pasir panjang', 'labrador'],
      east: ['east', 'tampines', 'bedok', 'pasir ris', 'changi', 'simei', 'tanah merah', 'expo', 'upper changi'],
      west: ['west', 'jurong', 'boon lay', 'tuas', 'clementi', 'bukit batok', 'choa chu kang', 'pioneer'],
      central: ['central', 'orchard', 'city hall', 'raffles', 'tanjong pagar', 'chinatown', 'outram', 'novena', 'bishan', 'ang mo kio', 'thomson', 'bukit timah', 'newton', 'dhoby ghaut', 'marina'],
      remote: ['remote'],
      hybrid: ['hybrid'],
      islandwide: ['islandwide', 'island wide', 'singapore'],
    };
    const loc = location.toLowerCase();
    const keywords = regionMap[loc];
    if (keywords) {
      const clauses = keywords.map(() => 'LOWER(j.location) LIKE ?').join(' OR ');
      where += ` AND (${clauses})`;
      params.push(...keywords.map(k => `%${k}%`));
    } else {
      where += ' AND j.location LIKE ?';
      params.push(`%${location}%`);
    }
  }
  if (salary_min) {
    where += ' AND j.salary_min >= ?';
    params.push(parseFloat(salary_min));
  }
  if (salary_max) {
    where += ' AND j.salary_max <= ?';
    params.push(parseFloat(salary_max));
  }

  // Sort order
  const sortMap = {
    newest: 'j.created_at DESC',
    oldest: 'j.created_at ASC',
    salary_high: 'j.salary_max DESC',
    salary_low: 'j.salary_min ASC',
    alpha: 'j.title ASC',
    closing: 'j.deadline ASC',
  };
  const orderBy = sortMap[sort] || 'j.created_at DESC';

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
       ORDER BY ${orderBy}
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

// GET /api/jobs/my — employer's own jobs with application counts
router.get('/my', authenticate, requireEmployer, async (req, res) => {
  try {
    await closeExpiredJobs();
    const [empRows] = await db.query('SELECT id FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1', [req.user.id]);
    if (empRows.length === 0) {
      return res.json({ success: true, jobs: [] });
    }
    const [jobs] = await db.query(
      `SELECT j.*, e.company_name,
        (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as application_count
       FROM jobs j
       JOIN employers e ON j.employer_id = e.id
       WHERE j.employer_id = ?
       ORDER BY j.created_at DESC`,
      [empRows[0].id]
    );
    res.json({ success: true, jobs });
  } catch (err) {
    console.error('Get my jobs error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/jobs/categories — get distinct categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT category FROM jobs WHERE category IS NOT NULL AND status = 'active' AND (deadline IS NULL OR deadline >= CURDATE()) ORDER BY category"
    );
    res.json({ success: true, categories: rows.map(r => r.category) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/jobs/stats — public stats for homepage & browse page
router.get('/stats', async (req, res) => {
  try {
    const openFilter = "status = 'active' AND (deadline IS NULL OR deadline >= CURDATE())";
    const [[{ activeJobs }]] = await db.query(`SELECT COUNT(*) as activeJobs FROM jobs WHERE ${openFilter}`);
    const [[{ totalEmployers }]] = await db.query(`SELECT COUNT(DISTINCT employer_id) as totalEmployers FROM jobs WHERE ${openFilter}`);
    const [[{ shortTermJobs }]] = await db.query(`SELECT COUNT(*) as shortTermJobs FROM jobs WHERE ${openFilter} AND job_type = 'short-term'`);
    const [[{ partTimeJobs }]] = await db.query(`SELECT COUNT(*) as partTimeJobs FROM jobs WHERE ${openFilter} AND job_type = 'part-time'`);
    res.json({ success: true, stats: { activeJobs, totalEmployers, shortTermJobs, partTimeJobs } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/jobs/companies — unique company names for filter
router.get('/companies', async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT e.company_name FROM employers e JOIN jobs j ON j.employer_id = e.id WHERE j.status = 'active' AND (j.deadline IS NULL OR j.deadline >= CURDATE()) ORDER BY e.company_name"
    );
    res.json({ success: true, companies: rows.map(r => r.company_name) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/jobs/smart-search — AI-powered natural language job search
router.post('/smart-search', async (req, res) => {
  const { query } = req.body;
  if (!query || query.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'Please provide a search query.' });
  }

  try {
    // Fetch all active jobs with full details
    const [jobs] = await db.query(
      `SELECT j.id, j.title, j.description, j.requirements, j.job_type, j.category,
              j.location, j.salary_min, j.salary_max, j.deadline, j.views, j.created_at,
              e.company_name, e.company_logo, e.industry
       FROM jobs j JOIN employers e ON j.employer_id = e.id
       WHERE j.status = 'active' AND (j.deadline IS NULL OR j.deadline >= CURDATE())`
    );

    if (!jobs.length) {
      return res.json({ success: true, jobs: [], total: 0 });
    }

    // ── AI-powered ranking (Gemini) ─────────────────────────────────────────
    // Falls through to keyword scoring below if the AI call fails or is unconfigured.
    try {
      const { aiRankJobs } = require('../utils/aiSearch');
      const ranked = await aiRankJobs(query, jobs);
      const byId = new Map(jobs.map(j => [j.id, j]));
      const aiResults = ranked
        .map(r => {
          const job = byId.get(r.id);
          if (!job) return null;
          return { ...job, _score: 1, _reason: r.reason || '' };
        })
        .filter(Boolean)
        .slice(0, 20);

      if (aiResults.length) {
        return res.json({ success: true, jobs: aiResults, total: aiResults.length, isFallback: false, ai: true });
      }
      // AI ran but found nothing relevant — show recent jobs as a soft fallback
      const recent = [...jobs]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
        .map(j => ({ ...j, _score: 0, _reason: 'No exact match — here are some recent openings.' }));
      return res.json({ success: true, jobs: recent, total: recent.length, isFallback: true, ai: true });
    } catch (aiErr) {
      console.warn('AI search unavailable, using keyword fallback:', aiErr.message);
    }

    // ── Keyword fallback (no API key / AI error) ────────────────────────────
    // Score each job based on keyword relevance to query
    const queryLower = query.toLowerCase();
    const queryWords = queryLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    // Domain keyword mappings for smarter matching
    const domainMap = {
      'video': ['video', 'editing', 'media', 'content', 'production', 'film', 'youtube'],
      'social media': ['social', 'media', 'content', 'marketing', 'instagram', 'tiktok', 'facebook'],
      'design': ['design', 'graphic', 'ui', 'ux', 'creative', 'visual', 'art', 'illustrat'],
      'coding': ['developer', 'engineer', 'software', 'programming', 'code', 'web', 'app', 'it'],
      'helping people': ['customer', 'service', 'support', 'care', 'counsell', 'social', 'community', 'nurse', 'welfare'],
      'events': ['event', 'coordinator', 'organis', 'planner', 'hospitality', 'operations'],
      'writing': ['writer', 'copywriter', 'content', 'editor', 'journalist', 'communications', 'pr'],
      'teaching': ['teach', 'tutor', 'educator', 'trainer', 'instructor', 'coach'],
      'finance': ['finance', 'accounting', 'audit', 'banking', 'investment', 'analyst'],
      'data': ['data', 'analytics', 'analyst', 'science', 'research', 'statistics', 'excel'],
      'sales': ['sales', 'business development', 'account', 'retail', 'customer'],
      'admin': ['admin', 'clerical', 'coordinator', 'office', 'secretary', 'hr', 'operations'],
    };

    // Expand query words using domain map
    const expandedWords = [...queryWords];
    for (const [domain, keywords] of Object.entries(domainMap)) {
      if (queryWords.some(w => domain.includes(w) || w.includes(domain.split(' ')[0]))) {
        expandedWords.push(...keywords);
      }
    }

    const scored = jobs.map(job => {
      const haystack = [
        job.title, job.description, job.requirements,
        job.category, job.job_type, job.industry
      ].filter(Boolean).join(' ').toLowerCase();

      let score = 0;
      const matchedTerms = [];

      for (const word of expandedWords) {
        if (haystack.includes(word)) {
          // Title matches worth more
          const titleScore = job.title.toLowerCase().includes(word) ? 3 : 0;
          const catScore = (job.category || '').toLowerCase().includes(word) ? 2 : 0;
          const descScore = haystack.includes(word) ? 1 : 0;
          const pts = titleScore + catScore + descScore;
          if (pts > 0) {
            score += pts;
            if (!matchedTerms.includes(word)) matchedTerms.push(word);
          }
        }
      }

      // Build reason string
      let reason = '';
      if (score > 0 && matchedTerms.length > 0) {
        const display = matchedTerms.slice(0, 4).join(', ');
        reason = `Recommended because this role involves ${display}.`;
      }

      return { ...job, _score: score, _reason: reason };
    });

    // Sort by score descending, take top 20
    const results = scored
      .filter(j => j._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 20);

    // If no matches found, return closest (top 5 by views/newest)
    if (!results.length) {
      const fallback = jobs
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
        .map(j => ({ ...j, _score: 0, _reason: 'Closest available match based on recent listings.' }));
      return res.json({ success: true, jobs: fallback, total: fallback.length, isFallback: true });
    }

    res.json({ success: true, jobs: results, total: results.length, isFallback: false });
  } catch (err) {
    console.error('Smart search error:', err);
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
    const [empRows] = await db.query(
      'SELECT id, verification_status, rejection_reason FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1',
      [req.user.id]
    );
    if (empRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Employer profile not found.' });
    }

    const employer = empRows[0];
    if (employer.verification_status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your company is pending admin verification. You cannot post jobs until approved.',
      });
    }
    if (employer.verification_status === 'rejected') {
      return res.status(403).json({
        success: false,
        message: employer.rejection_reason
          ? `Your company verification was rejected: ${employer.rejection_reason}`
          : 'Your company verification was rejected. Please contact the admin.',
      });
    }

    const [result] = await db.query(
      `INSERT INTO jobs (employer_id, title, description, requirements, location, job_type, category, salary_min, salary_max, deadline, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [employer.id, title, description, requirements, location, job_type, category, salary_min || null, salary_max || null, deadline || null]
    );

    res.status(201).json({ success: true, message: 'Job submitted for review.', jobId: result.insertId });
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/jobs/:id — update job (employer owns it)
router.put('/:id', authenticate, requireEmployer, async (req, res) => {
  const { id } = req.params;
  const { title, description, requirements, location, job_type, category, salary_min, salary_max, deadline, status } = req.body;

  try {
    const [empRows] = await db.query(
      'SELECT id FROM employers WHERE user_id = ? ORDER BY id ASC LIMIT 1',
      [req.user.id]
    );
    if (empRows.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Employer profile not found.' });
    }

    const [jobRows] = await db.query('SELECT * FROM jobs WHERE id = ?', [id]);
    if (jobRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }
    const existing = jobRows[0];

    if (req.user.role !== 'admin' && empRows[0].id !== existing.employer_id) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this job.' });
    }

    // Employers can only toggle active <-> closed; cannot self-approve pending/rejected
    // Editing a rejected job automatically resubmits it for admin review (pending)
    let nextStatus = existing.status;
    let clearRejectionReason = false;
    const isContentUpdate = [title, description, requirements, location, job_type, category, salary_min, salary_max, deadline]
      .some(v => v !== undefined);

    if (status !== undefined && status !== null && status !== '') {
      if (req.user.role === 'admin') {
        nextStatus = status;
      } else if (status === 'closed' && existing.status === 'active') {
        nextStatus = 'closed';
      } else if (status === 'active' && existing.status === 'closed') {
        nextStatus = 'active';
      } else if (status !== existing.status) {
        return res.status(403).json({
          success: false,
          message: 'You cannot change this job status. Pending and rejected jobs require admin review.',
        });
      }
    } else if (req.user.role !== 'admin' && existing.status === 'rejected' && isContentUpdate) {
      nextStatus = 'pending';
      clearRejectionReason = true;
    }

    // If only status was sent (close/reopen), keep other fields
    const nextTitle = title !== undefined ? title : existing.title;
    const nextDescription = description !== undefined ? description : existing.description;
    const nextRequirements = requirements !== undefined ? requirements : existing.requirements;
    const nextLocation = location !== undefined ? location : existing.location;
    const nextJobType = job_type !== undefined ? job_type : existing.job_type;
    const nextCategory = category !== undefined ? category : existing.category;
    const nextSalaryMin = salary_min !== undefined ? (salary_min || null) : existing.salary_min;
    const nextSalaryMax = salary_max !== undefined ? (salary_max || null) : existing.salary_max;
    const nextDeadline = deadline !== undefined ? (deadline || null) : existing.deadline;

    await db.query(
      `UPDATE jobs SET title=?, description=?, requirements=?, location=?, job_type=?, category=?, salary_min=?, salary_max=?, deadline=?, status=?,
        rejection_reason = CASE WHEN ? = 1 THEN NULL ELSE rejection_reason END
       WHERE id=?`,
      [
        nextTitle, nextDescription, nextRequirements, nextLocation, nextJobType, nextCategory,
        nextSalaryMin, nextSalaryMax, nextDeadline, nextStatus,
        clearRejectionReason ? 1 : 0,
        id,
      ]
    );

    if (nextStatus === 'active' && existing.status !== 'active') {
      try {
        await notifyJobAlerts(id);
      } catch (notifyErr) {
        console.error('Job alert notification error:', notifyErr);
      }
    }

    const message = clearRejectionReason
      ? 'Job updated and resubmitted for admin review.'
      : 'Job updated successfully.';
    res.json({ success: true, message, status: nextStatus });
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
