/**
 * AI-powered natural-language job search using Google Gemini.
 *
 * The @google/genai SDK is ESM-only, so it's loaded via dynamic import() from
 * this CommonJS module. If GEMINI_API_KEY is missing or the call fails, the
 * caller falls back to keyword search — this module just throws.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

let _clientPromise = null;
async function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  if (!_clientPromise) {
    _clientPromise = import('@google/genai').then(
      ({ GoogleGenAI }) => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    );
  }
  return _clientPromise;
}

function truncate(str, n) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Rank jobs by relevance to a natural-language query.
 * Returns an ordered array of { id, reason } (best match first), possibly empty.
 */
async function aiRankJobs(query, jobs) {
  const ai = await getClient();

  // Compact each job so the prompt stays small
  const catalogue = jobs.map(j => ({
    id: j.id,
    title: j.title,
    company: j.company_name,
    category: j.category || '',
    type: j.job_type || '',
    location: j.location || '',
    summary: truncate(`${j.description || ''} ${j.requirements || ''}`, 300),
  }));

  const prompt = `You are a career-matching assistant for Republic Polytechnic students.
A student described what they are looking for. From the job list below, pick the ones that genuinely fit and rank them best match first.

Student's request: "${query}"

Rules:
- Only include jobs that are genuinely relevant to the request. It is fine to return few, or even none.
- Return at most 20 jobs.
- For each, write one short, friendly sentence explaining why it fits the student's interest (do not just repeat the title).
- Use only the job "id" values provided.

Job list (JSON): ${JSON.stringify(catalogue)}`;

  const { Type } = await import('@google/genai');

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.INTEGER },
            reason: { type: Type.STRING },
          },
          required: ['id', 'reason'],
          propertyOrdering: ['id', 'reason'],
        },
      },
    },
  });

  const parsed = JSON.parse(res.text);
  if (!Array.isArray(parsed)) throw new Error('AI returned unexpected format');
  return parsed;
}

module.exports = { aiRankJobs };
