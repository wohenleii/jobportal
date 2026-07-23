/**
 * Migration: jobs.school — segments listings by RP school (PET/CET programme area)
 * Usage: node backend/scripts/add-job-school-field.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'defaultdb',
    ssl: { rejectUnauthorized: false },
  });

  console.log('Connected to MySQL');

  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'school'`
  );
  if (cols.length === 0) {
    await conn.query("ALTER TABLE jobs ADD COLUMN school VARCHAR(100) DEFAULT NULL AFTER category");
    console.log('Added jobs.school');
  } else {
    console.log('jobs.school already exists');
  }

  await conn.end();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
