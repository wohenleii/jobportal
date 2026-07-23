const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// In-memory rate counters (reset naturally by day/minute key)
const userDaily = new Map();   // `${userId}:${yyyy-mm-dd}` -> count
const userMinute = new Map();  // `${userId}:${yyyy-mm-ddTHH:MM}` -> count
const globalDaily = new Map(); // `${yyyy-mm-dd}` -> count

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function minuteKey(d = new Date()) {
  return d.toISOString().slice(0, 16);
}

function getLimit(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bump(map, key) {
  const next = (map.get(key) || 0) + 1;
  map.set(key, next);
  return next;
}

function checkRateLimits(userId) {
  const userDayLimit = getLimit('GEMINI_USER_DAILY_LIMIT', 40);
  const userMinLimit = getLimit('GEMINI_USER_MINUTE_LIMIT', 6);
  const globalDayLimit = getLimit('GEMINI_GLOBAL_DAILY_LIMIT', 400);

  const d = dayKey();
  const m = minuteKey();
  const userDayKey = `${userId}:${d}`;
  const userMinKey = `${userId}:${m}`;

  const userDayCount = userDaily.get(userDayKey) || 0;
  const userMinCount = userMinute.get(userMinKey) || 0;
  const globalCount = globalDaily.get(d) || 0;

  if (globalCount >= globalDayLimit) {
    return {
      ok: false,
      status: 429,
      message: 'AI assistant daily quota for this app has been reached. Please try again tomorrow.',
      limits: { globalDayLimit, globalCount },
    };
  }
  if (userDayCount >= userDayLimit) {
    return {
      ok: false,
      status: 429,
      message: `You have reached your daily AI chat limit (${userDayLimit} messages). Please try again tomorrow.`,
      limits: { userDayLimit, userDayCount },
    };
  }
  if (userMinCount >= userMinLimit) {
    return {
      ok: false,
      status: 429,
      message: 'You are sending messages too quickly. Please wait a minute and try again.',
      limits: { userMinLimit, userMinCount },
    };
  }

  return {
    ok: true,
    keys: { userDayKey, userMinKey, day: d },
    remaining: {
      userDaily: userDayLimit - userDayCount,
      userMinute: userMinLimit - userMinCount,
      globalDaily: globalDayLimit - globalCount,
    },
  };
}

function commitRateLimits(keys) {
  bump(userDaily, keys.userDayKey);
  bump(userMinute, keys.userMinKey);
  bump(globalDaily, keys.day);
}

function systemPromptForRole(role, name) {
  const formatRules = `Keep every reply SHORT — prefer a few bullet points or 2–4 short paragraphs. Do not write long essays.
Format replies with clear section headings in bold using markdown like **Heading**. Put a short line or bullets under each heading.
Example style:
**Main tip**
- Point one
- Point two
**Next step**
One short tip.`;

  if (role === 'employer') {
    const who = name || 'employer';
    return `You are JobPortal Assistant for employers.
Help ${who} with posting jobs, writing job descriptions, reviewing applicants, company profile tips, and Singapore hiring best practices.
${formatRules}
Do not invent private data about applicants or jobs.
If asked for anything illegal or unethical, refuse politely.
You support the JobPortal web app (employers post jobs; admins approve companies/jobs; students apply).`;
  }

  const who = name || 'student';
  return `You are JobPortal Assistant for students.
Help ${who} with career questions, resume tips, interview prep, job search strategy, skills to learn, and how to use JobPortal (browse jobs, apply, save jobs, complete profile).
${formatRules}
Do not invent specific job openings that may not exist on JobPortal.
If asked for anything illegal or unethical, refuse politely.
Keep answers encouraging and practical for Singapore students/graduates.`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-12)
    .map((item) => {
      const role = item && item.role === 'model' ? 'model' : 'user';
      const text = String((item && item.text) || '').trim().slice(0, 2000);
      return text ? { role, parts: [{ text }] } : null;
    })
    .filter(Boolean);
}

// POST /api/chat — Gemini proxy (auth required; key stays on server)
router.post('/', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'student' && role !== 'employer') {
      return res.status(403).json({ success: false, message: 'Chat is available for students and employers only.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'AI assistant is not configured. Ask the admin to set GEMINI_API_KEY in the server .env file.',
      });
    }

    const message = String((req.body && req.body.message) || '').trim();
    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ success: false, message: 'Message is too long (max 2000 characters).' });
    }

    const rate = checkRateLimits(req.user.id);
    if (!rate.ok) {
      return res.status(rate.status).json({ success: false, message: rate.message, limits: rate.limits });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    const history = normalizeHistory(req.body && req.body.history);
    const contents = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPromptForRole(role, req.user.name) }],
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    const data = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok) {
      console.error('Gemini API error:', geminiRes.status, data?.error?.message || data);
      const msg = data?.error?.message || 'Gemini request failed.';
      return res.status(502).json({
        success: false,
        message: msg.includes('API key')
          ? 'AI provider rejected the request. Check the server API key configuration.'
          : msg,
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();

    if (!reply) {
      return res.status(502).json({ success: false, message: 'No response was generated. Please try again.' });
    }

    commitRateLimits(rate.keys);

    res.json({
      success: true,
      reply,
      remaining: {
        userDaily: rate.remaining.userDaily - 1,
        userMinute: rate.remaining.userMinute - 1,
        globalDaily: rate.remaining.globalDaily - 1,
      },
    });
  } catch (err) {
    console.error('Chat route error:', err);
    res.status(500).json({ success: false, message: 'Server error while contacting the AI assistant.' });
  }
});

// GET /api/chat/status — remaining quota for current user
router.get('/status', authenticate, (req, res) => {
  if (req.user.role !== 'student' && req.user.role !== 'employer') {
    return res.status(403).json({ success: false, message: 'Chat is available for students and employers only.' });
  }
  const userDayLimit = getLimit('GEMINI_USER_DAILY_LIMIT', 40);
  const globalDayLimit = getLimit('GEMINI_GLOBAL_DAILY_LIMIT', 400);
  const d = dayKey();
  const userDayCount = userDaily.get(`${req.user.id}:${d}`) || 0;
  const globalCount = globalDaily.get(d) || 0;
  res.json({
    success: true,
    configured: !!process.env.GEMINI_API_KEY,
    remaining: {
      userDaily: Math.max(0, userDayLimit - userDayCount),
      globalDaily: Math.max(0, globalDayLimit - globalCount),
    },
    limits: {
      userDaily: userDayLimit,
      globalDaily: globalDayLimit,
      userMinute: getLimit('GEMINI_USER_MINUTE_LIMIT', 6),
    },
  });
});

module.exports = router;
