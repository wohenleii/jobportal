/**
 * Migration: add UEN field to employers for admin verification review
 * Usage: node backend/scripts/add-employer-uen.js
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
    ssl: process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false,
  });

  console.log('Connected to MySQL');

  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employers' AND COLUMN_NAME = 'uen'`
  );

  if (cols.length === 0) {
    await conn.query(`
      ALTER TABLE employers
        ADD COLUMN uen VARCHAR(50) DEFAULT NULL AFTER location
    `);
    console.log('Added uen column to employers');
  } else {
    console.log('uen already exists — skipping ALTER');
  }

  await conn.end();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
