const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || 'bobobloop11@gmail.com';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'JobPortal';

async function safeSend({ to, subject, html, attachments }) {
  if (!BREVO_API_KEY) {
    console.warn('Email not sent (BREVO_API_KEY not configured):', subject);
    return;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        attachment: attachments,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Brevo API error:', res.status, body);
    }
  } catch (err) {
    console.error('Email send error:', err.message);
  }
}

/**
 * Notify OSS admin inbox that a new job was submitted and needs review.
 */
async function sendAdminJobSubmissionAlert(job, companyName) {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) return;

  await safeSend({
    to: adminEmail,
    subject: `New job posting pending review: ${job.title}`,
    html: `
      <p>A new job posting was submitted and is awaiting approval.</p>
      <ul>
        <li><strong>Title:</strong> ${job.title}</li>
        <li><strong>Company:</strong> ${companyName}</li>
        <li><strong>Location:</strong> ${job.location}</li>
        <li><strong>Job Type:</strong> ${job.job_type}</li>
      </ul>
      <p>Review it in the admin dashboard to approve or reject.</p>
    `,
  });
}

/**
 * Confirm to the employer that their submission was received, with the job description attached as a PDF.
 */
async function sendEmployerConfirmation(job, toEmail, pdfBuffer) {
  if (!toEmail) return;

  await safeSend({
    to: toEmail,
    subject: `Job submission received: ${job.title}`,
    html: `
      <p>Thank you for your submission.</p>
      <p>Your job posting <strong>"${job.title}"</strong> has been received and will be reviewed by our team before it is published.</p>
      <p>A copy of your submission is attached for your reference.</p>
      <p>If you have any further queries, please reach out to us at
        ${process.env.CONTACT_EMAIL ? `<a href="mailto:${process.env.CONTACT_EMAIL}">${process.env.CONTACT_EMAIL}</a>` : 'our support team'}.
      </p>
    `,
    attachments: pdfBuffer
      ? [{ name: `${job.title.replace(/[^a-z0-9]+/gi, '-')}.pdf`, content: pdfBuffer.toString('base64') }]
      : undefined,
  });
}

module.exports = { sendAdminJobSubmissionAlert, sendEmployerConfirmation };
