/**
 * Seed new job listings from batch 6 PDFs
 * Jobs:
 *  1. Alpha Integrated REIT Management Pte Ltd - Property Management Executive
 *  2. Altallo Asset Management - Operations and Admin Executive
 *  3. Angel Manufacturing Singapore Pte. Ltd. - Associate Engineer
 *
 * Usage: node backend/scripts/seed-new-jobs-batch6.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../backend/.env') });
const mysql = require('mysql2/promise');

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });

  console.log('✅ Connected to database');

  // Get the first available employer_id
  const [empRows] = await conn.query('SELECT id FROM employers ORDER BY id ASC LIMIT 1');
  if (empRows.length === 0) {
    console.error('❌ No employer found. Run npm run setup-db first.');
    process.exit(1);
  }
  const employerId = empRows[0].id;
  console.log('Using employer_id:', employerId);

  const jobs = [
    {
      title: 'Property Management Executive',
      description: `Alpha Integrated REIT Management Pte Ltd is seeking a Property Management Executive to join their property management team, reporting directly to the Head of Property Management.

Key Responsibilities:

Property Management:
• Conduct rigorous daily walkthroughs of the property to proactively identify defects, cleanliness issues, or safety hazards.
• Identify facilities defects, log technical anomalies, and coordinate with engineering teams to ensure prompt corrective action.
• Assist in the coordination of repair works and preventive maintenance schedules for building systems (Lift, Fire Protection, Plumbing).
• Ensure the property adheres strictly to local building codes and fire safety regulations.
• Assist in the planning and execution of emergency fire drills and safety briefings for all building occupants.
• Monitor, evaluate, and audit the performance of term contractors (M&E, security, environmental services, landscaping) against established Service Level Agreements (SLAs).
• Support procurement workflows by sourcing and obtaining competitive quotations from vendors for minor repair and cyclical works.
• Serve as the professional first point of contact for tenants, residents, and owners regarding lease management operations and facility inquiries.
• Manage property feedback loops, resolving tenant grievances and operational friction points with high diplomacy and efficiency.
• Facilitate seamless unit handover and takeover processes, accurately documenting property condition reports and inventory audits.`,
      requirements: `• Diploma in Real Estate, Facilities Management, Real Estate Business, or a related Built Environment discipline.
• Foundational knowledge of mechanical, electrical, and plumbing (MEP) systems, smart building technologies, or property management software.
• Strong interpersonal, verbal, and written communication skills suitable for corporate reporting and tenant engagement.
• A proactive, solutions-oriented individual with a positive working attitude and a commitment to operational excellence.
• A highly collaborative team player who can work effectively with contractors, technicians, and senior management alike.`,
      location: 'Singapore',
      job_type: 'full-time',
      category: 'Real Estate',
      salary_min: null,
      salary_max: null,
      deadline: '2026-08-31',
      company: 'Alpha Integrated REIT Management Pte Ltd',
    },
    {
      title: 'Operations and Admin Executive',
      description: `Altallo is a growing real estate investment and fund management platform seeking an Operations and Admin Executive to join their team. This role is ideal for someone who wants early exposure to the operations side of a fast-paced real estate investment and fund management business.

Location: Singapore-based hybrid role
Salary: SGD 2,300 – 2,600/month (depending on experience)
Fresh graduates from Polytechnics / ITE welcome.

Key Responsibilities:
• Provide administrative and operational support across the business and internal teams.
• Coordinate schedules, meetings, documentation, and internal reporting requirements.
• Assist with maintaining proper records, filing systems, and business documentation.
• Support day-to-day office operations and coordination with external stakeholders or service providers.
• Assist with preparation of presentations, reports, and operational materials.
• Handle general administrative matters and support ad-hoc operational projects where required.
• Work closely with management and team members to support smooth business operations.

Why Join Altallo:
• Direct exposure to a growing real estate investment platform.
• Opportunity to work closely with leadership and experienced professionals.
• Fast-learning environment with broad exposure across business functions.
• Strong growth opportunities for motivated and driven individuals.

Apply via JobStreet: https://sg.jobstreet.com/job/92037825?ref=cm-ui`,
      requirements: `• Fresh graduates from Polytechnics or ITE are welcome to apply.
• Organised, responsible, and detail-oriented.
• Strong willingness to learn and grow professionally.
• Communicates well and works effectively within a team environment.
• Proactive and adaptable in a fast-moving work environment.
• Has an interest in the real estate, investment, or finance industry.`,
      location: 'Singapore (Hybrid)',
      job_type: 'full-time',
      category: 'Operations & Admin',
      salary_min: 2300,
      salary_max: 2600,
      deadline: '2026-08-31',
      company: 'Altallo Asset Management',
    },
    {
      title: 'Associate Engineer',
      description: `Angel Manufacturing Singapore Pte. Ltd. is the world's No. 1 leading company in the playing card industry. Angel Group owns the world's largest share for the manufacture of casino playing cards and related equipment, with 70 years of history. The company started from Japan and now has offices in USA, Singapore, Australia, Macau, Philippines, Mexico, and France with over 400 employees worldwide.

Angel is the first company in the Jurong Innovative District, operating from a four-storey regional headquarters with an R&D Centre and factory.

Location: 12 Bulim Avenue, Singapore 648167 (Nearest MRT: Boon Lay; company coach available from Jurong East MRT)
Salary: SGD 3,200/month + Up to SGD 300 Performance Allowance
Benefits: Medical Insurance, Lunch provided, 14 days Annual Leave
Working Hours: 8:30AM – 5:30PM (8hrs/day, 1hr break), Off on Sat & Sun
No experience needed.

Job Description:
• Operate machines and execute production as per production schedule and meet targeted output.
• Perform initial level of troubleshooting of equipment-related problems to minimise downtime.
• Interact with staff support to ensure smooth and optimum level of machine operational efficiency.
• Establish effective preventive maintenance.
• Control the quality of outputs using advanced technologies.
• Control the flow of various goods and materials through digital quantity monitoring system.
• Manage multiple priorities.
• Other ad hoc duties.`,
      requirements: `• No experience needed — fresh graduates are welcome.
• Ability to operate machinery and follow production schedules.
• Willingness to perform troubleshooting and preventive maintenance tasks.
• Attentive to quality control and detail-oriented.
• Able to manage multiple priorities and work in a structured manufacturing environment.`,
      location: 'Singapore (Jurong)',
      job_type: 'full-time',
      category: 'Manufacturing & Engineering',
      salary_min: 3200,
      salary_max: 3500,
      deadline: '2026-08-31',
      company: 'Angel Manufacturing Singapore Pte. Ltd.',
    },
  ];

  let inserted = 0;
  for (const job of jobs) {
    await conn.query(
      `INSERT INTO jobs (employer_id, title, description, requirements, location, job_type, category, salary_min, salary_max, deadline, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        employerId,
        job.title,
        job.description,
        job.requirements,
        job.location,
        job.job_type,
        job.category,
        job.salary_min,
        job.salary_max,
        job.deadline,
      ]
    );
    inserted++;
    console.log(`✅ Inserted: ${job.title} — ${job.company}`);
  }

  console.log(`\n🎉 Done! ${inserted} jobs added to the portal.`);
  await conn.end();
}

seed().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
