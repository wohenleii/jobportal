const db = require('../config/db');

/**
 * Create a single notification for a user.
 */
async function createNotification({ userId, type, title, message, link = null, relatedId = null }) {
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, type, title, message, link, related_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, message, link, relatedId]
  );
  return result.insertId;
}

/**
 * Notify student when application status becomes shortlisted, rejected, or hired.
 */
async function notifyApplicationStatus(applicationId, status) {
  const alertStatuses = ['shortlisted', 'rejected', 'hired'];
  if (!alertStatuses.includes(status)) return;

  const [rows] = await db.query(
    `SELECT a.user_id, a.job_id, j.title AS job_title, e.company_name
     FROM applications a
     JOIN jobs j ON a.job_id = j.id
     JOIN employers e ON j.employer_id = e.id
     WHERE a.id = ?`,
    [applicationId]
  );
  if (!rows.length) return;

  const app = rows[0];
  const titles = {
    shortlisted: 'Application shortlisted',
    rejected: 'Application update',
    hired: 'Congratulations — you were hired!',
  };
  const messages = {
    shortlisted: `You have been shortlisted for "${app.job_title}" at ${app.company_name}.`,
    rejected: `Your application for "${app.job_title}" at ${app.company_name} was not selected.`,
    hired: `You have been hired for "${app.job_title}" at ${app.company_name}!`,
  };

  await createNotification({
    userId: app.user_id,
    type: 'application_status',
    title: titles[status],
    message: messages[status],
    link: '/profile.html',
    relatedId: applicationId,
  });
}

/**
 * Notify students whose interest fields match a newly active job's category.
 */
async function notifyJobAlerts(jobId) {
  const [jobs] = await db.query(
    `SELECT j.id, j.title, j.category, e.company_name
     FROM jobs j
     JOIN employers e ON j.employer_id = e.id
     WHERE j.id = ? AND j.status = 'active'`,
    [jobId]
  );
  if (!jobs.length || !jobs[0].category) return;

  const job = jobs[0];
  const category = String(job.category).trim();

  const [students] = await db.query(
    `SELECT id, interest_fields FROM users
     WHERE role = 'student'
       AND interest_fields IS NOT NULL
       AND interest_fields != ''`
  );

  for (const student of students) {
    const interests = String(student.interest_fields)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!interests.includes(category)) continue;

    // Avoid duplicate alerts for the same job + student
    const [existing] = await db.query(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = 'job_alert' AND related_id = ?
       LIMIT 1`,
      [student.id, jobId]
    );
    if (existing.length) continue;

    await createNotification({
      userId: student.id,
      type: 'job_alert',
      title: 'New job in your field',
      message: `"${job.title}" at ${job.company_name} was posted in ${category}.`,
      link: `/jobs.html?id=${jobId}`,
      relatedId: jobId,
    });
  }
}

module.exports = {
  createNotification,
  notifyApplicationStatus,
  notifyJobAlerts,
};
