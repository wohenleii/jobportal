/**
 * Fix script — cleans up duplicate employer profiles
 * Usage: node backend/scripts/fix-employer.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../backend/.env') });
const mysql = require('mysql2/promise');

async function fix() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true,
  });

  console.log('✅ Connected to database:', process.env.DB_NAME);

  // Keep only the lowest id employer profile per user, delete the rest
  await conn.query(`
    DELETE FROM employers
    WHERE id NOT IN (
      SELECT min_id FROM (
        SELECT MIN(id) as min_id FROM employers GROUP BY user_id
      ) as t
    )
  `);
  console.log('✅ Duplicate employer profiles removed');

  // Check result
  const [employers] = await conn.query('SELECT * FROM employers');
  console.log('\n🏢 Employers after fix:');
  employers.forEach(e => console.log(`   id=${e.id} user_id=${e.user_id} company=${e.company_name}`));

  // Check jobs
  const [jobs] = await conn.query('SELECT id, title, status, employer_id FROM jobs LIMIT 10');
  console.log('\n💼 Jobs in database:');
  if (jobs.length === 0) {
    console.log('   ⚠️  No jobs found!');
  } else {
    jobs.forEach(j => console.log(`   id=${j.id} employer_id=${j.employer_id} title=${j.title} status=${j.status}`));
  }

  await conn.end();
  console.log('\n🎉 Fix complete! Restart the server with: npm start');
}

fix().catch(err => {
  console.error('❌ Fix failed:', err.message);
  process.exit(1);
});
