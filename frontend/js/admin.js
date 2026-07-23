  // Admin dashboard boot
const user = api.getUser();
if (!user || user.role !== 'admin') {
  window.location.href = '/login.html';
} else {
  const nameEl = document.getElementById('adminName');
  const avatarEl = document.getElementById('adminAvatar');
  if (nameEl) nameEl.textContent = user.name;
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
}

let usersPage = 1, jobsPage = 1, companiesPage = 1;
let categoryChart, typeChart, viewsChart, appsChart;
let rejectModal, rejectJobModal, jobDetailsModal, companyDetailsModal;

  function toggleSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('sidebar-collapsed');
  }

  function openMobileSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarBackdrop').classList.add('show');
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop').classList.remove('show');
  }

  function goToJobsSection() {
    const link = [...document.querySelectorAll('.sidebar .nav-link')].find(a => a.textContent.includes('Jobs'));
    showSection('jobs', link);
    document.getElementById('jobStatusFilter').value = 'pending';
    loadAdminJobs();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showSection(name, link) {
    document.querySelectorAll('[id^="section-"]').forEach(el => el.classList.add('d-none'));
    document.getElementById(`section-${name}`).classList.remove('d-none');
    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
    if (link) link.classList.add('active');
    document.getElementById('sectionTitle').textContent =
      { dashboard: 'Dashboard', companies: 'Companies', users: 'Users', jobs: 'Jobs', analytics: 'Analytics' }[name];
    if (name === 'companies') loadCompanies();
    if (name === 'users') loadUsers();
    if (name === 'jobs') loadAdminJobs();
    if (name === 'analytics') loadAnalytics();
    closeMobileSidebar();
  }
  // ── Dashboard ────────────────────────────────────────────────────────────
  const CHART_COLORS = ['#2563EB','#16A34A','#F59E0B','#DC2626','#7C3AED','#0891B2','#DB2777','#65A30D'];

  function groupSmallCategories(rows, minShare = 0.04) {
    const total = rows.reduce((s, r) => s + Number(r.count || 0), 0) || 1;
    const sorted = [...rows].sort((a, b) => Number(b.count) - Number(a.count));
    const main = [];
    let other = 0;
    sorted.forEach(r => {
      const count = Number(r.count || 0);
      if (count / total < minShare && sorted.length > 5) other += count;
      else main.push({ category: r.category || 'Other', count });
    });
    if (other > 0) main.push({ category: 'Other', count: other });
    return main;
  }

  async function loadDashboard() {
    const showDashError = (msg) => {
      document.getElementById('statCards').innerHTML = `
        <div class="col-12">
          <div class="alert alert-danger mb-0">
            <strong>Could not load dashboard.</strong> ${escapeHtml(msg || 'Please try again.')}
            <button type="button" class="btn btn-sm btn-outline-danger ms-2" onclick="loadDashboard()">Retry</button>
          </div>
        </div>`;
      document.getElementById('pendingReviewTable').innerHTML =
        `<tr><td colspan="5" class="text-center text-danger py-3">${escapeHtml(msg || 'Failed to load.')}</td></tr>`;
      document.getElementById('topJobsTable').innerHTML =
        `<tr><td colspan="4" class="text-center text-danger py-3">${escapeHtml(msg || 'Failed to load.')}</td></tr>`;
    };

    try {
      const data = await api.getAdminStats();
      const { stats, jobsByCategory, jobsByType, topJobs } = data;

      // Show core stats immediately (don't wait on charts / pending jobs)
      document.getElementById('statCards').innerHTML = `
        <div class="col-sm-6 col-xl-3">
          <div class="stat-card">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="title">Total Jobs</div>
                <div class="value">${stats.totalJobs ?? 0}</div>
              </div>
              <div class="icon bg-primary bg-opacity-10 text-primary"><i class="bi bi-briefcase-fill"></i></div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-xl-3">
          <div class="stat-card">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="title">Active Users</div>
                <div class="value">${stats.totalUsers ?? 0}</div>
              </div>
              <div class="icon bg-success bg-opacity-10 text-success"><i class="bi bi-people-fill"></i></div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-xl-3">
          <div class="stat-card">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="title">Applications</div>
                <div class="value">${stats.totalApplications ?? 0}</div>
              </div>
              <div class="icon bg-warning bg-opacity-10 text-warning"><i class="bi bi-file-earmark-text-fill"></i></div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-xl-3">
          <div class="stat-card">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="title">Pending Reviews</div>
                <div class="value" id="pendingReviewsValue">…</div>
              </div>
              <div class="icon bg-danger bg-opacity-10 text-danger"><i class="bi bi-hourglass-split"></i></div>
            </div>
          </div>
        </div>
      `;

      document.getElementById('topJobsTable').innerHTML = (topJobs || []).map((j, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="fw-semibold">${escapeHtml(j.title)}</td>
          <td class="text-muted">${escapeHtml(j.company_name)}</td>
          <td><span class="badge bg-primary">${j.views}</span></td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="text-center text-muted">No jobs yet.</td></tr>';

      // Charts (optional — don't block the rest of the dashboard)
      try {
        if (typeof Chart === 'undefined') throw new Error('Chart.js failed to load');

        const categories = groupSmallCategories(jobsByCategory || []);
        if (categoryChart) categoryChart.destroy();
        categoryChart = new Chart(document.getElementById('categoryChart'), {
          type: 'bar',
          data: {
            labels: categories.map(r => r.category),
            datasets: [{
              label: 'Jobs',
              data: categories.map(r => r.count),
              backgroundColor: CHART_COLORS,
              borderRadius: 6,
              borderSkipped: false,
            }],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.parsed.x} job${ctx.parsed.x === 1 ? '' : 's'}`,
                },
              },
            },
            scales: {
              x: { beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { precision: 0 } },
              y: { grid: { display: false } },
            },
          },
        });
        document.getElementById('categoryChartSummary').textContent =
          categories.length
            ? `Top category: ${categories[0].category} (${categories[0].count}). ${categories.map(c => `${c.category}: ${c.count}`).join('; ')}.`
            : 'No category data available.';

        const types = [...(jobsByType || [])].sort((a, b) => Number(b.count) - Number(a.count));
        const labelPlugin = {
          id: 'valueLabels',
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            chart.data.datasets.forEach((dataset, i) => {
              const meta = chart.getDatasetMeta(i);
              meta.data.forEach((bar, idx) => {
                const val = dataset.data[idx];
                ctx.save();
                ctx.fillStyle = '#64748B';
                ctx.font = '600 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(val), bar.x, bar.y - 6);
                ctx.restore();
              });
            });
          },
        };
        if (typeChart) typeChart.destroy();
        typeChart = new Chart(document.getElementById('typeChart'), {
          type: 'bar',
          data: {
            labels: types.map(r => r.job_type),
            datasets: [{
              label: 'Jobs',
              data: types.map(r => r.count),
              backgroundColor: '#2563EB',
              borderRadius: 8,
              borderSkipped: false,
              maxBarThickness: 40,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            layout: { padding: { top: 16 } },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} jobs` } },
            },
            scales: {
              y: { beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { precision: 0 } },
              x: { grid: { display: false } },
            },
          },
          plugins: [labelPlugin],
        });
        document.getElementById('typeChartSummary').textContent =
          types.length
            ? types.map(t => `${t.job_type}: ${t.count}`).join('; ') + '.'
            : 'No job type data available.';
      } catch (chartErr) {
        console.warn('Chart render skipped:', chartErr);
        document.getElementById('categoryChartSummary').textContent = 'Charts unavailable right now.';
        document.getElementById('typeChartSummary').textContent = 'Charts unavailable right now.';
      }

      // Pending jobs (separate so a slow jobs call doesn't blank the whole page)
      let pendingJobsCount = 0;
      let pendingJobs = [];
      try {
        const pendingData = await api.getAdminJobs({ status: 'pending', page: 1, limit: 5 });
        pendingJobsCount = pendingData.pagination?.total || 0;
        pendingJobs = pendingData.jobs || [];
      } catch (e) {
        console.warn(e);
        document.getElementById('pendingReviewTable').innerHTML =
          `<tr><td colspan="5" class="text-center text-danger py-3">Could not load pending jobs.</td></tr>`;
      }

      const pendingEl = document.getElementById('pendingReviewsValue');
      if (pendingEl) pendingEl.textContent = String((stats.pendingEmployers || 0) + pendingJobsCount);

      if (pendingJobs) {
        document.getElementById('pendingReviewTable').innerHTML = pendingJobs.length
          ? pendingJobs.map(j => `
            <tr>
              <td class="fw-semibold">${escapeHtml(j.title)}</td>
              <td class="text-muted small">${escapeHtml(j.company_name)}</td>
              <td class="text-muted small">${j.created_at ? new Date(j.created_at).toLocaleDateString() : '—'}</td>
              <td><span class="status-badge pending">Pending</span></td>
              <td>
                <button type="button" class="btn btn-sm btn-primary" onclick="reviewPendingJob(${j.id})">Review</button>
              </td>
            </tr>
          `).join('')
          : '<tr><td colspan="5" class="text-center text-muted py-3">No jobs waiting for review.</td></tr>';
      }
    } catch (err) {
      console.error(err);
      showDashError(err.message || 'Failed to load dashboard stats');
      showToast('Failed to load dashboard stats', 'danger');
    }
  }

  function reviewPendingJob(id) {
    goToJobsSection();
    setTimeout(() => openJobDetails(id), 300);
  }
  // ── Companies ────────────────────────────────────────────────────────────
  let companiesCache = {};

  function verificationBadge(status) {
    if (status === 'approved') return '<span class="status-badge active">Approved</span>';
    if (status === 'rejected') return '<span class="status-badge rejected">Rejected</span>';
    return '<span class="status-badge pending">Pending</span>';
  }

  async function loadCompanies() {
    const status = document.getElementById('companyStatusFilter').value;
    try {
      const data = await api.getAdminEmployers({ status, page: companiesPage, limit: 15 });
      companiesCache = {};
      (data.employers || []).forEach(e => { companiesCache[e.id] = e; });
      document.getElementById('companyCount').textContent = `${data.pagination.total} companies`;
      document.getElementById('companiesTable').innerHTML = (data.employers || []).length
        ? data.employers.map(e => `
          <tr>
            <td>
              <a href="#" class="fw-semibold text-decoration-none" onclick="openCompanyDetails(${e.id}); return false;">${escapeHtml(e.company_name)}</a>
              ${e.company_website ? `<div><a href="${escapeHtml(e.company_website)}" target="_blank" rel="noopener noreferrer" class="small text-muted">${escapeHtml(e.company_website)}</a></div>` : ''}
              ${e.verification_status === 'rejected' && e.rejection_reason
                ? `<div class="small text-danger mt-1"><i class="bi bi-info-circle me-1"></i>${escapeHtml(e.rejection_reason)}</div>`
                : ''}
            </td>
            <td class="font-monospace small">${escapeHtml(e.uen) || '<span class="text-muted">—</span>'}</td>
            <td>
              <div class="fw-semibold small">${escapeHtml(e.contact_name)}</div>
              <div class="text-muted small">${escapeHtml(e.contact_email)}</div>
            </td>
            <td class="text-muted small">${escapeHtml(e.industry) || '—'}</td>
            <td class="text-muted small">${escapeHtml(e.location) || '—'}</td>
            <td>${verificationBadge(e.verification_status)}</td>
            <td class="text-muted small">${new Date(e.created_at).toLocaleDateString()}</td>
            <td class="text-nowrap">
              ${e.verification_status !== 'approved'
                ? `<button class="btn btn-sm btn-success me-1" title="Approve" onclick="approveCompany(${e.id})"><i class="bi bi-check-lg"></i></button>`
                : ''}
              ${e.verification_status !== 'rejected'
                ? `<button class="btn btn-sm btn-outline-danger" title="Reject" onclick="openRejectModal(${e.id})"><i class="bi bi-x-lg"></i></button>`
                : `<button class="btn btn-sm btn-outline-secondary" title="Set Pending" onclick="setCompanyPending(${e.id})"><i class="bi bi-arrow-counterclockwise"></i></button>`}
            </td>
          </tr>
        `).join('')
        : '<tr><td colspan="8" class="text-center text-muted py-4">No companies found.</td></tr>';
      renderAdminPagination('companiesPagination', data.pagination, p => { companiesPage = p; loadCompanies(); });
    } catch (err) {
      showToast(err.message || 'Failed to load companies', 'danger');
    }
  }

  function openCompanyDetails(id) {
    const e = companiesCache[id];
    const body = document.getElementById('companyDetailsBody');
    const footer = document.getElementById('companyDetailsFooter');
    if (!e) {
      body.innerHTML = '<div class="alert alert-danger mb-0">Company not found.</div>';
      companyDetailsModal.show();
      return;
    }

    const websiteHtml = e.company_website
      ? `<a href="${escapeHtml(e.company_website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.company_website)}</a>`
      : '<span class="text-muted">Not provided</span>';

    body.innerHTML = `
      <div class="mb-3">
        <h4 class="fw-bold mb-1">${escapeHtml(e.company_name)}</h4>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          ${verificationBadge(e.verification_status)}
          ${e.industry ? `<span class="badge bg-light text-secondary">${escapeHtml(e.industry)}</span>` : ''}
          ${e.location ? `<span class="badge bg-light text-secondary"><i class="bi bi-geo-alt"></i> ${escapeHtml(e.location)}</span>` : ''}
        </div>
      </div>
      ${e.verification_status === 'rejected' && e.rejection_reason
        ? `<div class="alert alert-danger"><strong>Rejection reason:</strong> ${escapeHtml(e.rejection_reason)}</div>`
        : ''}
      <div class="row g-3 mb-3">
        <div class="col-md-6">
          <div class="p-3 bg-light rounded-3 h-100">
            <div class="small text-muted">UEN</div>
            <div class="fw-semibold font-monospace">${escapeHtml(e.uen) || '<span class="text-muted">Not provided</span>'}</div>
            <div class="small text-muted mt-1">Check this against ACRA / Bizfile before approving.</div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="p-3 bg-light rounded-3 h-100">
            <div class="small text-muted">Contact</div>
            <div class="fw-semibold">${escapeHtml(e.contact_name || '—')}</div>
            <div class="small text-muted">${escapeHtml(e.contact_email || '')}</div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="p-3 bg-light rounded-3 h-100">
            <div class="small text-muted">Website / Social Media</div>
            <div class="fw-semibold text-break">${websiteHtml}</div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="p-3 bg-light rounded-3 h-100">
            <div class="small text-muted">Industry</div>
            <div class="fw-semibold">${escapeHtml(e.industry) || '—'}</div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="p-3 bg-light rounded-3 h-100">
            <div class="small text-muted">Location (Singapore)</div>
            <div class="fw-semibold">${escapeHtml(e.location) || '—'}</div>
          </div>
        </div>
      </div>
      <h6 class="fw-bold">Company Overview</h6>
      <p class="text-muted" style="white-space:pre-line">${escapeHtml(e.company_description) || 'No company overview provided yet.'}</p>
      <div class="small text-muted mt-3">
        Registered: ${e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
        ${e.verified_at ? ` · Verified: ${new Date(e.verified_at).toLocaleString()}` : ''}
      </div>
    `;

    let actions = '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>';
    if (e.verification_status !== 'approved') {
      actions = `<button type="button" class="btn btn-success" onclick="companyDetailsModal.hide(); approveCompany(${e.id})"><i class="bi bi-check-lg me-1"></i>Approve</button>` + actions;
    }
    if (e.verification_status !== 'rejected') {
      actions = `<button type="button" class="btn btn-outline-danger me-auto" onclick="companyDetailsModal.hide(); openRejectModal(${e.id})"><i class="bi bi-x-lg me-1"></i>Reject</button>` + actions;
    }
    footer.innerHTML = actions;
    companyDetailsModal.show();
  }

  async function approveCompany(id) {
    if (!confirm('Approve this company? They will be able to post jobs.')) return;
    try {
      await api.updateEmployerStatus(id, 'approved');
      showToast('Company approved', 'success');
      loadCompanies();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openRejectModal(id) {
    const company = companiesCache[id];
    document.getElementById('rejectCompanyId').value = id;
    document.getElementById('rejectCompanyName').textContent = company ? company.company_name : 'this company';
    document.getElementById('rejectReasonInput').value = '';
    rejectModal.show();
  }

  async function confirmRejectCompany() {
    const id = document.getElementById('rejectCompanyId').value;
    const reason = document.getElementById('rejectReasonInput').value.trim();
    if (!reason) {
      showToast('Please enter a rejection reason', 'warning');
      return;
    }
    try {
      await api.updateEmployerStatus(id, 'rejected', reason);
      rejectModal.hide();
      showToast('Company rejected', 'success');
      loadCompanies();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async function setCompanyPending(id) {
    try {
      await api.updateEmployerStatus(id, 'pending');
      showToast('Company set to pending', 'success');
      loadCompanies();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }
  // ── Users ────────────────────────────────────────────────────────────────
  let removeUserTarget = null;
  let removeUserModal;
  const escHtml = (str) => escapeHtml(str);

  async function loadUsers() {
    const role = document.getElementById('userRoleFilter').value;
    const account_status = document.getElementById('userStatusFilter')?.value || '';
    try {
      const data = await api.getAdminUsers({ role, account_status, page: usersPage, limit: 15 });
      document.getElementById('userCount').textContent = `${data.pagination.total} users`;
      document.getElementById('usersTable').innerHTML = data.users.map(u => {
        const isRemoved = u.account_status === 'removed';
        const statusBadge = isRemoved
          ? `<span class="badge bg-secondary" title="${escHtml(u.removal_reason || '')}">Removed</span>`
          : '<span class="badge bg-success">Active</span>';
        let action = '<span class="text-muted small">You</span>';
        if (u.id !== user.id) {
          if (u.role === 'admin') {
            action = '<span class="text-muted small">—</span>';
          } else if (isRemoved) {
            action = `<span class="text-muted small" title="${escHtml(u.removal_reason || '')}">Removed</span>`;
          } else {
            action = `<button type="button" class="btn btn-sm btn-outline-danger" title="Remove user"
              data-user-id="${u.id}" data-user-name="${escHtml(u.name)}"
              onclick="openRemoveUserModal(this)">
              <i class="bi bi-x-lg fw-bold" aria-hidden="true"></i><span class="visually-hidden">Remove</span>
            </button>`;
          }
        }
        return `
        <tr class="${isRemoved ? 'table-secondary' : ''}">
          <td class="text-muted small">${u.id}</td>
          <td class="fw-semibold">${escHtml(u.name)}</td>
          <td class="text-muted small">${escHtml(u.email)}</td>
          <td><span class="badge bg-${u.role === 'admin' ? 'danger' : u.role === 'employer' ? 'warning text-dark' : 'primary'}">${escHtml(u.role)}</span></td>
          <td>${statusBadge}</td>
          <td class="text-muted small">${new Date(u.created_at).toLocaleDateString()}</td>
          <td>${action}</td>
        </tr>`;
      }).join('');
      renderAdminPagination('usersPagination', data.pagination, p => { usersPage = p; loadUsers(); });
    } catch (err) {
      showToast('Failed to load users', 'danger');
    }
  }

  function openRemoveUserModal(btnOrId, maybeName) {
    let id;
    let name;
    if (typeof btnOrId === 'object' && btnOrId?.dataset) {
      id = parseInt(btnOrId.dataset.userId, 10);
      name = btnOrId.dataset.userName || `User #${id}`;
    } else {
      id = parseInt(btnOrId, 10);
      name = maybeName || `User #${id}`;
    }
    removeUserTarget = { id, name };
    document.getElementById('removeUserName').textContent = name;
    document.getElementById('removeUserReason').value = '';
    if (!removeUserModal) {
      removeUserModal = new bootstrap.Modal(document.getElementById('removeUserModal'));
    }
    removeUserModal.show();
    setTimeout(() => document.getElementById('removeUserReason')?.focus(), 300);
  }

  async function confirmRemoveUser() {
    if (!removeUserTarget) return;
    const reason = document.getElementById('removeUserReason').value.trim();
    if (!reason) {
      showToast('Please provide a reason for removing this user.', 'warning');
      document.getElementById('removeUserReason').focus();
      return;
    }
    const btn = document.getElementById('confirmRemoveUserBtn');
    btn.disabled = true;
    try {
      await api.deleteUser(removeUserTarget.id, reason);
      removeUserModal.hide();
      showToast('User account removed. They can no longer sign in.', 'success');
      loadUsers();
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      removeUserTarget = null;
    }
  }
  // ── Jobs ─────────────────────────────────────────────────────────────────
  let jobsCache = {};

  function jobStatusBadge(status, job) {
    const isPast = job && job.deadline && new Date(job.deadline) < new Date(new Date().toDateString());
    if (isPast) return '<span class="status-badge expired">Expired</span>';
    if (status === 'active') return '<span class="status-badge active">Active</span>';
    if (status === 'rejected') return '<span class="status-badge rejected">Rejected</span>';
    if (status === 'closed') return '<span class="status-badge closed">Closed</span>';
    return '<span class="status-badge pending">Pending</span>';
  }

  async function loadAdminJobs() {
    const status = document.getElementById('jobStatusFilter').value;
    try {
      const data = await api.getAdminJobs({ status, page: jobsPage, limit: 15 });
      jobsCache = {};
      (data.jobs || []).forEach(j => { jobsCache[j.id] = j; });
      document.getElementById('jobCount').textContent = `${data.pagination.total} jobs`;
      document.getElementById('jobsTable').innerHTML = (data.jobs || []).length
        ? data.jobs.map(j => `
        <tr>
          <td class="text-muted small">${j.id}</td>
          <td>
            <a href="#" class="fw-semibold text-decoration-none" onclick="openJobDetails(${j.id});return false;">${escapeHtml(j.title)}</a>
            ${j.deadline ? `<div class="small text-muted">Deadline: ${new Date(j.deadline).toLocaleDateString()}</div>` : ''}
            ${j.status === 'rejected' && j.rejection_reason
              ? `<div class="small text-danger mt-1"><i class="bi bi-info-circle me-1"></i>${escapeHtml(j.rejection_reason)}</div>`
              : ''}
          </td>
          <td class="text-muted small">${escapeHtml(j.company_name)}</td>
          <td><span class="badge-type ${badgeClass(j.job_type)}">${j.job_type}</span></td>
          <td>${jobStatusBadge(j.status, j)}</td>
          <td>${j.views}</td>
          <td class="text-nowrap">
            ${status === 'past' ? '<span class="text-muted small">—</span>' : `
            ${j.status !== 'active'
              ? `<button class="btn btn-sm btn-success me-1" title="Approve" onclick="approveJob(${j.id})"><i class="bi bi-check-lg"></i></button>`
              : ''}
            ${j.status !== 'rejected'
              ? `<button class="btn btn-sm btn-outline-danger" title="Reject" onclick="openRejectJobModal(${j.id})"><i class="bi bi-x-lg"></i></button>`
              : `<button class="btn btn-sm btn-outline-secondary" title="Set Pending" onclick="setJobPending(${j.id})"><i class="bi bi-arrow-counterclockwise"></i></button>`}
            `}
          </td>
        </tr>
      `).join('')
        : '<tr><td colspan="7" class="text-center text-muted py-4">No jobs found.</td></tr>';
      renderAdminPagination('jobsPagination', data.pagination, p => { jobsPage = p; loadAdminJobs(); });
    } catch (err) {
      showToast(err.message || 'Failed to load jobs', 'danger');
    }
  }

  async function approveJob(id) {
    if (!confirm('Approve this job post? It will become visible to students.')) return;
    try {
      await api.updateJobStatus(id, 'active');
      showToast('Job approved', 'success');
      loadAdminJobs();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openRejectJobModal(id) {
    const job = jobsCache[id];
    document.getElementById('rejectJobId').value = id;
    document.getElementById('rejectJobTitle').textContent = job ? job.title : 'this job';
    document.getElementById('rejectJobReasonInput').value = '';
    rejectJobModal.show();
  }

  async function confirmRejectJob() {
    const id = document.getElementById('rejectJobId').value;
    const reason = document.getElementById('rejectJobReasonInput').value.trim();
    if (!reason) {
      showToast('Please enter a rejection reason', 'warning');
      return;
    }
    try {
      await api.updateJobStatus(id, 'rejected', reason);
      rejectJobModal.hide();
      showToast('Job rejected', 'success');
      loadAdminJobs();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async function setJobPending(id) {
    try {
      await api.updateJobStatus(id, 'pending');
      showToast('Job set to pending', 'success');
      loadAdminJobs();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async function openJobDetails(id) {
    const body = document.getElementById('jobDetailsBody');
    body.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
    jobDetailsModal.show();

    try {
      let job = jobsCache[id];
      if (!job || !job.description) {
        const data = await api.getJob(id);
        job = data.job;
      }
      body.innerHTML = renderJobDetailsHtml(job);
    } catch (err) {
      body.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Failed to load job details.')}</div>`;
    }
  }

  function renderJobDetailsHtml(job) {
    return `
      <div class="mb-3">
        <h4 class="fw-bold mb-1">${escapeHtml(job.title)}</h4>
        <div class="text-muted mb-2">${escapeHtml(job.company_name || '')}</div>
        <div class="d-flex flex-wrap gap-2">
          <span class="badge-type ${badgeClass(job.job_type)}">${escapeHtml(job.job_type || '')}</span>
          ${job.location ? `<span class="badge bg-light text-secondary"><i class="bi bi-geo-alt"></i> ${escapeHtml(job.location)}</span>` : ''}
          ${job.category ? `<span class="badge bg-light text-secondary">${escapeHtml(job.category)}</span>` : ''}
          ${jobStatusBadge(job.status, job)}
        </div>
      </div>
      <div class="row g-3 mb-4">
        <div class="col-sm-4">
          <div class="p-3 bg-light rounded-3">
            <div class="small text-muted">Salary</div>
            <div class="fw-semibold text-success">${formatSalary(job.salary_min, job.salary_max)}</div>
          </div>
        </div>
        <div class="col-sm-4">
          <div class="p-3 bg-light rounded-3">
            <div class="small text-muted">Deadline</div>
            <div class="fw-semibold">${job.deadline ? new Date(job.deadline).toLocaleDateString() : 'Open'}</div>
          </div>
        </div>
        <div class="col-sm-4">
          <div class="p-3 bg-light rounded-3">
            <div class="small text-muted">Views</div>
            <div class="fw-semibold">${job.views || 0}</div>
          </div>
        </div>
      </div>
      ${job.status === 'rejected' && job.rejection_reason
        ? `<div class="alert alert-danger"><strong>Rejection reason:</strong> ${escapeHtml(job.rejection_reason)}</div>`
        : ''}
      <h6 class="fw-bold">Job Description</h6>
      <p class="text-muted" style="white-space:pre-line">${escapeHtml(job.description || 'No description.')}</p>
      ${job.requirements
        ? `<h6 class="fw-bold mt-3">Requirements</h6><p class="text-muted" style="white-space:pre-line">${escapeHtml(job.requirements)}</p>`
        : ''}
      <div class="small text-muted mt-3">Posted: ${job.created_at ? new Date(job.created_at).toLocaleString() : '—'}</div>
    `;
  }
  // ── Analytics ────────────────────────────────────────────────────────────
  async function loadAnalytics() {
    try {
      const data = await api.getAnalytics();
      if (viewsChart) viewsChart.destroy();
      viewsChart = new Chart(document.getElementById('viewsChart'), {
        type: 'line',
        data: {
          labels: data.viewsPerDay.map(r => r.date),
          datasets: [{ label: 'Views', data: data.viewsPerDay.map(r => r.views), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.4 }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, grid: { color: '#E2E8F0' } }, x: { grid: { display: false } } } }
      });
      if (appsChart) appsChart.destroy();
      appsChart = new Chart(document.getElementById('appsChart'), {
        type: 'line',
        data: {
          labels: data.appsPerDay.map(r => r.date),
          datasets: [{ label: 'Applications', data: data.appsPerDay.map(r => r.applications), borderColor: '#16A34A', backgroundColor: 'rgba(22,163,74,0.1)', fill: true, tension: 0.4 }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, grid: { color: '#E2E8F0' } }, x: { grid: { display: false } } } }
      });
      document.getElementById('mostAppliedTable').innerHTML = data.mostApplied.map((j, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="fw-semibold">${j.title}</td>
          <td class="text-muted">${j.company_name}</td>
          <td><span class="badge bg-success">${j.application_count}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      showToast('Failed to load analytics', 'danger');
    }
  }
  // ── Pagination helper ────────────────────────────────────────────────────
  function renderAdminPagination(containerId, { page, total, limit }, onPage) {
    const pages = Math.ceil(total / limit);
    if (pages <= 1) { document.getElementById(containerId).innerHTML = ''; return; }
    let html = '<nav><ul class="pagination pagination-sm">';
    html += `<li class="page-item ${page === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="(${onPage.toString()})(${page-1});return false;">‹</a></li>`;
    for (let i = 1; i <= pages; i++) {
      html += `<li class="page-item ${i === page ? 'active' : ''}"><a class="page-link" href="#" onclick="(${onPage.toString()})(${i});return false;">${i}</a></li>`;
    }
    html += `<li class="page-item ${page === pages ? 'disabled' : ''}"><a class="page-link" href="#" onclick="(${onPage.toString()})(${page+1});return false;">›</a></li>`;
    html += '</ul></nav>';
    document.getElementById(containerId).innerHTML = html;
  }
  // Init
function bootAdminDashboard() {
  if (!user || user.role !== 'admin') return;
  try {
    rejectModal = new bootstrap.Modal(document.getElementById('rejectCompanyModal'));
    rejectJobModal = new bootstrap.Modal(document.getElementById('rejectJobModal'));
    jobDetailsModal = new bootstrap.Modal(document.getElementById('jobDetailsModal'));
    companyDetailsModal = new bootstrap.Modal(document.getElementById('companyDetailsModal'));
  } catch (err) {
    console.error('Admin modal init error:', err);
  }
  loadDashboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAdminDashboard);
} else {
  bootAdminDashboard();
}
