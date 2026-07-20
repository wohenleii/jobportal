/**
 * Migration: add rejected status + rejection_reason to jobs
 * Usage: node backend/scripts/add-job-rejection.js
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

  await conn.query(`
    ALTER TABLE jobs
      MODIFY COLUMN status ENUM('active', 'closed', 'pending', 'rejected') DEFAULT 'pending'
  `);
  console.log('Updated jobs.status ENUM to include rejected');

  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'rejection_reason'`
  );

  if (cols.length === 0) {
    await conn.query(`ALTER TABLE jobs ADD COLUMN rejection_reason TEXT DEFAULT NULL`);
    console.log('Added jobs.rejection_reason');
  } else {
    console.log('rejection_reason already exists — skipping');
  }

  await conn.end();
  console.log('Migration complete');
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
