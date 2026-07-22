/**
 * Migration: soft-remove users (account_status + removal_reason)
 * Usage: node backend/scripts/add-user-removal.js
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
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'account_status'`
  );

  if (cols.length === 0) {
    await conn.query(`
      ALTER TABLE users
        ADD COLUMN account_status ENUM('active', 'removed') DEFAULT 'active' AFTER interest_fields,
        ADD COLUMN removal_reason TEXT DEFAULT NULL AFTER account_status,
        ADD COLUMN removed_at TIMESTAMP NULL DEFAULT NULL AFTER removal_reason
    `);
    console.log('Added users.account_status, removal_reason, removed_at');
  } else {
    console.log('User removal columns already exist');
  }

  await conn.end();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
