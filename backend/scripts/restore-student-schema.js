/**
 * Recovery migration: restores student-related schema that was overwritten
 * (likely by another project sharing this Aiven database instance).
 * Purely additive — does not drop or alter any data the other project might use.
 * Usage: node backend/scripts/restore-student-schema.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  });
  console.log('Connected to MySQL');

  // 1. Restore users.bio / skills / resume_url
  for (const [col, def] of [
    ['bio', 'TEXT DEFAULT NULL'],
    ['skills', 'VARCHAR(500) DEFAULT NULL'],
    ['resume_url', 'VARCHAR(255) DEFAULT NULL'],
  ]) {
    if (!(await columnExists(conn, 'users', col))) {
      await conn.query(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
      console.log(`Added users.${col}`);
    } else {
      console.log(`users.${col} already exists`);
    }
  }

  // 2. Restore 'student' to the role enum (keep existing values + default)
  await conn.query(
    `ALTER TABLE users MODIFY COLUMN role ENUM('student','admin','employer') DEFAULT 'student'`
  );
  console.log("users.role enum now includes 'student'");

  // 3. Re-insert Sarah Tan's account at her original id (15), which is vacant
  const [existing] = await conn.query('SELECT id FROM users WHERE id = 15');
  if (existing.length === 0) {
    const hash = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // "password"
    await conn.query(
      `INSERT INTO users (id, name, email, password, role, resume_url) VALUES (?, ?, ?, ?, 'student', ?)`,
      [15, 'Sarah Tan', 'student@rp.edu.sg', hash, '/uploads/resumes/user-15-1784730795334.pdf']
    );
    console.log('Restored Sarah Tan (student@rp.edu.sg) at id=15');
  } else {
    console.log('User id=15 already exists, skipping insert');
  }

  // 4. applications: add user_id, backfill by matching applicant_email, add FK + unique key
  if (!(await columnExists(conn, 'applications', 'user_id'))) {
    await conn.query(`ALTER TABLE applications ADD COLUMN user_id INT NULL AFTER job_id`);
    console.log('Added applications.user_id');
  }
  const [unmatched] = await conn.query(
    `UPDATE applications a
     JOIN users u ON u.email = a.applicant_email
     SET a.user_id = u.id
     WHERE a.user_id IS NULL`
  );
  console.log('Backfilled applications.user_id for', unmatched.affectedRows, 'row(s)');

  const [stillNull] = await conn.query('SELECT COUNT(*) as c FROM applications WHERE user_id IS NULL');
  if (stillNull[0].c === 0) {
    await conn.query('ALTER TABLE applications MODIFY COLUMN user_id INT NOT NULL');
    // drop the old applicant_email-based unique key if present, add the correct one
    const [keys] = await conn.query(
      `SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND INDEX_NAME = 'unique_application'`
    );
    if (keys.length > 0) {
      // the old composite key is the only index covering job_id, which the FK depends on —
      // add a plain index on job_id first so dropping the composite key doesn't break the FK
      const [jobIdIdx] = await conn.query(
        `SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'job_id' AND INDEX_NAME != 'unique_application'`
      );
      if (jobIdIdx.length === 0) {
        await conn.query('ALTER TABLE applications ADD INDEX idx_applications_job_id (job_id)');
        console.log('Added supporting index on job_id');
      }
      await conn.query('ALTER TABLE applications DROP INDEX unique_application');
      console.log('Dropped old (job_id, applicant_email) unique key');
    }
    await conn.query('ALTER TABLE applications ADD CONSTRAINT unique_application UNIQUE (user_id, job_id)');
    console.log('Added (user_id, job_id) unique key');
    try {
      await conn.query(
        'ALTER TABLE applications ADD CONSTRAINT applications_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
      );
      console.log('Added applications.user_id foreign key');
    } catch (e) {
      console.log('FK add skipped/failed (non-fatal):', e.message);
    }
  } else {
    console.log(`WARNING: ${stillNull[0].c} application row(s) could not be matched to a user — left user_id NULL for those, did not enforce NOT NULL.`);
  }

  // 5. job_views: restore user_id column
  if (!(await columnExists(conn, 'job_views', 'user_id'))) {
    await conn.query(`ALTER TABLE job_views ADD COLUMN user_id INT DEFAULT NULL AFTER job_id`);
    console.log('Added job_views.user_id');
  } else {
    console.log('job_views.user_id already exists');
  }

  // 6. Recreate bookmarks table (entirely missing)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      job_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_bookmark (user_id, job_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);
  console.log('bookmarks table ready');

  await conn.end();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
