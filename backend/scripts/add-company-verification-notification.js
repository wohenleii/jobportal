/**
 * Migration: allow company_verification notification type
 * Usage: node backend/scripts/add-company-verification-notification.js
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

  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications'`
  );

  // Preserve any existing enum values (e.g. admin_review) while adding company_verification
  const enumValues = [
    'application_status',
    'job_alert',
    'admin_review',
    'company_verification',
  ];
  const enumSql = enumValues.map((v) => `'${v}'`).join(', ');

  if (tables.length === 0) {
    await conn.query(`
      CREATE TABLE notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type ENUM(${enumSql}) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(255) DEFAULT NULL,
        related_id INT DEFAULT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_notifications_user (user_id, is_read, created_at)
      )
    `);
    console.log('Created notifications table with company_verification type');
  } else {
    await conn.query(`
      ALTER TABLE notifications
      MODIFY COLUMN type ENUM(${enumSql}) NOT NULL
    `);
    console.log('Updated notifications.type ENUM to include company_verification');
  }

  await conn.end();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
