/**
 * Migration: page_views — site-wide pageview beacon for unique-visitor + CTR analytics
 * Usage: node backend/scripts/add-page-views.js
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
    CREATE TABLE IF NOT EXISTS page_views (
      id INT AUTO_INCREMENT PRIMARY KEY,
      path VARCHAR(255) NOT NULL,
      user_id INT DEFAULT NULL,
      ip_address VARCHAR(45) DEFAULT NULL,
      viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_page_views_viewed_at (viewed_at)
    )
  `);
  console.log('page_views table ready');

  await conn.end();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
