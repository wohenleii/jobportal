/**
 * Script to fix the jobs.job_type ENUM to include 'short-term'
 * instead of 'internship', aligning with the frontend.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/db');

async function fixEnum() {
  try {
    console.log('Altering jobs.job_type ENUM...');
    await db.query(`
      ALTER TABLE jobs
      MODIFY COLUMN job_type ENUM('full-time', 'part-time', 'short-term', 'contract', 'remote') DEFAULT 'full-time'
    `);
    console.log('✅ ENUM updated successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

fixEnum();
