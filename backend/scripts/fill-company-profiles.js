/**
 * Fill / normalize company profiles for existing employers.
 * Usage: node backend/scripts/fill-company-profiles.js
 */
const db = require('../config/db');

const INDUSTRY_MAP = {
  Technology: 'Information Technology',
  IT: 'Information Technology',
  Finance: 'Banking & Finance',
  Banking: 'Banking & Finance',
  'Real Estate': 'Construction & Real Estate',
  'Real Estate / Finance': 'Construction & Real Estate',
  'Food & Beverage': 'Hospitality & Tourism',
  Hospitality: 'Hospitality & Tourism',
  Manufacturing: 'Engineering & Manufacturing',
  Engineering: 'Engineering & Manufacturing',
  'E-Commerce / Beauty Retail': 'Retail & E-commerce',
  Retail: 'Retail & E-commerce',
  Marketing: 'Media & Marketing',
  Logistics: 'Transportation & Logistics',
};

const ALLOWED_INDUSTRIES = new Set([
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
]);

const ALLOWED_LOCATIONS = new Set(['Islandwide', 'North', 'South', 'East', 'West', 'Central']);

const PROFILE_BY_NAME = {
  'Tech Corp': {
    company_description:
      'Tech Corp builds digital products and software services for businesses across Asia. Our Singapore team focuses on product engineering, cloud platforms, and graduate talent development.',
    industry: 'Information Technology',
    location: 'Central',
    company_website: 'https://techcorp.com',
  },
  'Alpha Integrated REIT Management Pte Ltd': {
    company_description:
      'Alpha Integrated REIT Management oversees real estate investment trusts and asset management operations in Singapore, supporting portfolio performance, investor relations, and property strategy.',
    industry: 'Construction & Real Estate',
    location: 'Central',
  },
  'Altallo Asset Management': {
    company_description:
      'Altallo Asset Management provides investment and asset management services with a focus on real estate and finance. The firm supports research, portfolio monitoring, and client reporting from Singapore.',
    industry: 'Banking & Finance',
    location: 'Central',
  },
  'Hua Kee Cantonese Chicken Rice (3 Eats Pte Ltd)': {
    company_description:
      'Hua Kee Cantonese Chicken Rice is a Singapore F&B brand under 3 Eats Pte Ltd, serving classic Cantonese chicken rice and related dishes across multiple outlets islandwide.',
    industry: 'Hospitality & Tourism',
    location: 'Islandwide',
  },
  'Angel Manufacturing Singapore Pte Ltd': {
    company_description:
      'Angel Manufacturing Singapore designs and produces industrial and consumer goods. The company supports manufacturing operations, quality control, and supply-chain roles in Singapore.',
    industry: 'Engineering & Manufacturing',
    location: 'West',
    company_website: 'https://www.angel-manufacturing.com.sg',
  },
  'Beureka Pte Ltd': {
    company_description:
      'Beureka is a Singapore-based e-commerce and beauty retail company offering curated products online and through digital marketing channels.',
    industry: 'Retail & E-commerce',
    location: 'Islandwide',
  },
  testing1: {
    company_description:
      'testing1 is an employer account used for portal testing and job posting workflows in Singapore.',
    industry: 'Other',
    location: 'Islandwide',
  },
  'Fresh Co 55576': {
    company_description:
      'Fresh Co is a newly registered employer on JobPortal. Complete this profile with your business overview before posting roles.',
    industry: 'Other',
    location: 'Islandwide',
  },
};

function mapIndustry(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (ALLOWED_INDUSTRIES.has(raw)) return raw;
  return INDUSTRY_MAP[raw] || 'Other';
}

function mapLocation(value) {
  if (!value) return 'Islandwide';
  const raw = String(value).trim().toLowerCase();
  if (raw.includes('north')) return 'North';
  if (raw.includes('south')) return 'South';
  if (raw.includes('east')) return 'East';
  if (raw.includes('west')) return 'West';
  if (raw.includes('central')) return 'Central';
  return 'Islandwide';
}

async function run() {
  const [rows] = await db.query(
    'SELECT id, company_name, company_description, industry, location, company_website FROM employers ORDER BY id'
  );

  let updated = 0;
  for (const row of rows) {
    const preset = PROFILE_BY_NAME[row.company_name] || {};
    const next = {
      company_description: row.company_description || preset.company_description || null,
      industry: mapIndustry(preset.industry || row.industry) || 'Other',
      location: ALLOWED_LOCATIONS.has(preset.location)
        ? preset.location
        : mapLocation(preset.location || row.location),
      company_website: row.company_website || preset.company_website || null,
    };

    // Prefer normalized industry/location even when already set
    if (preset.industry) next.industry = mapIndustry(preset.industry);
    if (preset.location) next.location = preset.location;
    if (preset.company_description && !row.company_description) {
      next.company_description = preset.company_description;
    }
    if (preset.company_website && !row.company_website) {
      next.company_website = preset.company_website;
    }

    await db.query(
      `UPDATE employers
       SET company_description = ?, industry = ?, location = ?, company_website = ?
       WHERE id = ?`,
      [next.company_description, next.industry, next.location, next.company_website, row.id]
    );
    updated += 1;
    console.log(`Updated #${row.id} ${row.company_name} → ${next.industry} / ${next.location}`);
  }

  console.log(`\nDone. Updated ${updated} company profile(s).`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to fill company profiles:', err);
  process.exit(1);
});
