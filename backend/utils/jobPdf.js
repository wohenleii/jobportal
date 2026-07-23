const PDFDocument = require('pdfkit');

/**
 * Render a one-page PDF summary of a job posting.
 * Returns a Promise<Buffer>.
 */
function generateJobPdf(job, companyName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const salaryRange = job.salary_min && job.salary_max
      ? `$${Number(job.salary_min).toLocaleString()} - $${Number(job.salary_max).toLocaleString()} / mo`
      : job.salary_min
      ? `From $${Number(job.salary_min).toLocaleString()} / mo`
      : job.salary_max
      ? `Up to $${Number(job.salary_max).toLocaleString()} / mo`
      : 'Not specified';

    doc.fontSize(20).font('Helvetica-Bold').text(job.title, { align: 'left' });
    doc.fontSize(13).font('Helvetica').fillColor('#555').text(companyName);
    doc.moveDown(1);

    doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text('Job Details');
    doc.font('Helvetica').fontSize(10);
    const details = [
      ['Location', job.location],
      ['Job Type', job.job_type],
      ['Category', job.category || 'N/A'],
      ['School', job.school || 'N/A'],
      ['Salary Range', salaryRange],
      ['Application Deadline', job.deadline ? new Date(job.deadline).toDateString() : 'None'],
    ];
    details.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(String(value));
    });
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(11).text('Description');
    doc.font('Helvetica').fontSize(10).text(job.description, { align: 'left' });
    doc.moveDown(1);

    if (job.requirements) {
      doc.font('Helvetica-Bold').fontSize(11).text('Requirements');
      doc.font('Helvetica').fontSize(10).text(job.requirements, { align: 'left' });
    }

    doc.end();
  });
}

module.exports = { generateJobPdf };
