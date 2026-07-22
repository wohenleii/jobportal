const db = require('../config/db');

/**
 * Mark active jobs whose application deadline has passed as closed.
 * Returns the number of jobs closed.
 */
async function closeExpiredJobs() {
  const [result] = await db.query(
    `UPDATE jobs
     SET status = 'closed'
     WHERE status = 'active'
       AND deadline IS NOT NULL
       AND deadline < CURDATE()`
  );
  return result.affectedRows || 0;
}

module.exports = { closeExpiredJobs };
