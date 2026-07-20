/**
 * Migration: add company verification fields to employers
 * Usage: node backend/scripts/add-employer-verification.js
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
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employers' AND COLUMN_NAME = 'verification_status'`
  );

  if (cols.length === 0) {
    await conn.query(`
      ALTER TABLE employers
        ADD COLUMN verification_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        ADD COLUMN rejection_reason TEXT DEFAULT NULL,
        ADD COLUMN verified_at TIMESTAMP NULL DEFAULT NULL
    `);
    console.log('Added verification_status, rejection_reason, verified_at');
  } else {
    console.log('verification_status already exists — skipping ALTER');
  }

  // Existing employers stay usable (approve them)
  const [result] = await conn.query(
    `UPDATE employers SET verification_status = 'approved', verified_at = COALESCE(verified_at, NOW())
     WHERE verification_status = 'pending' OR verification_status IS NULL`
  );
  console.log(`Approved ${result.affectedRows} existing employer(s)`);

  await conn.end();
  console.log('Migration complete');
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
