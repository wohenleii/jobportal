/**
 * API utility — centralizes all fetch calls to the backend.
 */
const API_BASE = '/api';

const api = {
  /** Get stored JWT token */
  getToken() {
    return localStorage.getItem('jp_token');
  },

  /** Get stored user object */
  getUser() {
    const u = localStorage.getItem('jp_user');
    return u ? JSON.parse(u) : null;
  },

  /** Save auth data after login/register */
  saveAuth(token, user) {
    localStorage.setItem('jp_token', token);
    localStorage.setItem('jp_user', JSON.stringify(user));
  },

  /** Clear auth data on logout */
  clearAuth() {
    localStorage.removeItem('jp_token');
    localStorage.removeItem('jp_user');
    localStorage.removeItem('jp_employer_profile');
  },

  /** Check if user is logged in */
  isLoggedIn() {
    return !!this.getToken();
  },

  /** Fire-and-forget pageview beacon for site analytics */
  trackPageview() {
    fetch(`${API_BASE}/analytics/pageview`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ path: window.location.pathname }),
    }).catch(() => {});
  },

  /** Build headers with optional auth */
  headers(auth = true) {
    const h = { 'Content-Type': 'application/json' };
    if (auth && this.getToken()) {
      h['Authorization'] = `Bearer ${this.getToken()}`;
    }
    return h;
  },

  /** Generic request wrapper */
  async request(method, endpoint, body = null, auth = true) {
    const options = {
      method,
      headers: this.headers(auth),
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  },

  get: (endpoint, auth = true) => api.request('GET', endpoint, null, auth),
  post: (endpoint, body, auth = true) => api.request('POST', endpoint, body, auth),
  put: (endpoint, body, auth = true) => api.request('PUT', endpoint, body, auth),
  delete: (endpoint, auth = true) => api.request('DELETE', endpoint, null, auth),

  // ── Auth ──────────────────────────────────────────────────────────────
  async login(email, password) {
    const data = await this.post('/auth/login', { email, password }, false);
    this.saveAuth(data.token, data.user);
    return data;
  },

  async register(payload) {
    const data = await this.post('/auth/register', payload, false);
    this.saveAuth(data.token, data.user);
    return data;
  },

  logout() {
    this.clearAuth();
    window.location.href = '/login.html';
  },

  async getMe() {
    return this.get('/auth/me');
  },

  async updateProfile(payload) {
    return this.put('/auth/profile', payload);
  },

  async getInterestCategories() {
    return this.get('/auth/interest-categories', false);
  },

  async uploadResume(file) {
    const formData = new FormData();
    formData.append('resume', file);
    const res = await fetch(`${API_BASE}/auth/resume`, {
      method: 'POST',
      headers: this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Upload failed');
    return data;
  },

  // ── Notifications ─────────────────────────────────────────────────────
  async getNotifications(limit = 30) {
    return this.get(`/notifications?limit=${limit}`);
  },

  async getUnreadNotificationCount() {
    return this.get('/notifications/unread-count');
  },

  async markNotificationRead(id) {
    return this.put(`/notifications/${id}/read`, {});
  },

  async markAllNotificationsRead() {
    return this.put('/notifications/read-all', {});
  },

  // ── Jobs ──────────────────────────────────────────────────────────────
  async getJobs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/jobs?${qs}`, false);
  },

  async getJob(id) {
    return this.get(`/jobs/${id}`, this.isLoggedIn());
  },

  async createJob(payload) {
    return this.post('/jobs', payload);
  },

  async updateJob(id, payload) {
    return this.put(`/jobs/${id}`, payload);
  },

  async deleteJob(id) {
    return this.delete(`/jobs/${id}`);
  },

  async getCategories() {
    return this.get('/jobs/categories', false);
  },

  async getPublicStats() {
    return this.get('/jobs/stats', false);
  },

  async getCompanies() {
    return this.get('/jobs/companies', false);
  },

  async smartSearch(query) {
    return this.post('/jobs/smart-search', { query }, false);
  },

  // ── Bookmarks ─────────────────────────────────────────────────────────
  async getBookmarks() {
    return this.get('/bookmarks');
  },

  async addBookmark(jobId) {
    return this.post(`/bookmarks/${jobId}`, {});
  },

  async removeBookmark(jobId) {
    return this.delete(`/bookmarks/${jobId}`);
  },

  async checkBookmark(jobId) {
    return this.get(`/bookmarks/check/${jobId}`);
  },

  // ── Applications ──────────────────────────────────────────────────────
  async applyJob(jobId, coverLetter) {
    return this.post(`/applications/${jobId}`, { cover_letter: coverLetter });
  },

  async getMyApplications() {
    return this.get('/applications/my');
  },

  // ── Employer ──────────────────────────────────────────────────────────
  async getEmployerProfile() {
    return this.get('/auth/employer-profile');
  },

  async updateEmployerProfile(payload) {
    return this.put('/auth/employer-profile', payload);
  },

  async getEmployerJobs() {
    return this.get('/jobs/my');
  },

  async getEmployerStats() {
    return this.get('/applications/employer/stats');
  },

  async getEmployerApplications() {
    return this.get('/applications/employer');
  },

  async getJobApplications(jobId) {
    return this.get(`/applications/job/${jobId}`);
  },

  async updateApplicationStatus(appId, status) {
    return this.put(`/applications/${appId}/status`, { status });
  },

  // ── Admin ─────────────────────────────────────────────────────────────
  async getAdminStats() {
    return this.get('/admin/stats');
  },

  async getAdminUsers(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/admin/users?${qs}`);
  },

  async deleteUser(id, reason) {
    return this.put(`/admin/users/${id}/remove`, { reason });
  },

  async getAdminJobs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/admin/jobs?${qs}`);
  },

  async updateJobStatus(id, status, rejection_reason = '') {
    return this.put(`/admin/jobs/${id}/status`, { status, rejection_reason });
  },

  async getAdminEmployers(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/admin/employers?${qs}`);
  },

  async updateEmployerStatus(id, status, rejection_reason = '') {
    return this.put(`/admin/employers/${id}/status`, { status, rejection_reason });
  },

  async getAnalytics() {
    return this.get('/admin/analytics');
  },
};

// ── Shared UI helpers ──────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer') || (() => {
    const el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();

  const id = 'toast_' + Date.now();
  const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center text-bg-${type} border-0 show mb-2" role="alert">
      <div class="d-flex">
        <div class="toast-body">${icons[type] || ''} ${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `);

  setTimeout(() => document.getElementById(id)?.remove(), 4000);
}

function formatSalary(min, max) {
  if (!min && !max) return 'Salary not specified';
  const fmt = n => `$${Number(n).toLocaleString()}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}/mo`;
  if (min) return `From ${fmt(min)}/mo`;
  return `Up to ${fmt(max)}/mo`;
}

function companyInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function firstNameFromFull(name) {
  const first = String(name || '').trim().split(/\s+/)[0];
  return first || 'there';
}

function isStudentProfileComplete(user) {
  if (!user) return false;
  return !!(
    String(user.name || '').trim() &&
    String(user.bio || '').trim() &&
    String(user.skills || '').trim() &&
    String(user.resume_url || '').trim()
  );
}

function studentProfileMissingFields(user) {
  const missing = [];
  if (!user || !String(user.name || '').trim()) missing.push('Full name');
  if (!user || !String(user.bio || '').trim()) missing.push('Bio');
  if (!user || !String(user.skills || '').trim()) missing.push('Skills');
  if (!user || !String(user.resume_url || '').trim()) missing.push('Resume (PDF or link)');
  return missing;
}

const JOB_INTEREST_CATEGORIES = [
  'Software & IT',
  'Sales',
  'Marketing',
  'Accounting & Finance',
  'Human Resources',
  'Customer Service',
  'Administration',
  'Engineering',
  'Design',
  'Operations',
  'Healthcare',
  'Education',
  'Other',
];

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgoShort(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Poll + toast new notifications for students */
const notificationPoller = {
  timer: null,
  knownIds: new Set(),
  primed: false,

  start() {
    const user = api.getUser();
    if (!user || user.role !== 'student' || !api.isLoggedIn()) {
      this.stop();
      return;
    }
    if (this.timer) return;
    this.refresh(true);
    this.timer = setInterval(() => this.refresh(false), 20000);
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.knownIds.clear();
    this.primed = false;
  },

  async refresh(initial = false) {
    if (!api.isLoggedIn()) return;
    const user = api.getUser();
    if (!user || user.role !== 'student') return;

    try {
      const data = await api.getNotifications(30);
      const list = data.notifications || [];
      updateNotificationBadge(data.unread || 0);
      renderNotificationDropdown(list);

      if (!this.primed || initial) {
        list.forEach((n) => this.knownIds.add(n.id));
        this.primed = true;
        return;
      }

      const fresh = list.filter((n) => !this.knownIds.has(n.id));
      fresh.reverse().forEach((n) => {
        this.knownIds.add(n.id);
        const toastType =
          n.type === 'job_alert'
            ? 'info'
            : (n.title || '').toLowerCase().includes('hired') || (n.title || '').toLowerCase().includes('shortlisted')
              ? 'success'
              : 'warning';
        showToast(n.message || n.title, toastType);
      });
      list.forEach((n) => this.knownIds.add(n.id));
    } catch (_) {
      // silent — avoid noisy toasts if session expired mid-page
    }
  },
};

function updateNotificationBadge(count) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('d-none');
  } else {
    badge.classList.add('d-none');
  }
}

function renderNotificationDropdown(list) {
  const menu = document.getElementById('notifMenu');
  if (!menu) return;

  // Keep the header (first li), replace the rest
  while (menu.children.length > 1) menu.removeChild(menu.lastChild);

  if (!list.length) {
    menu.insertAdjacentHTML(
      'beforeend',
      '<li class="px-3 py-3 text-muted small text-center">No notifications yet</li>'
    );
    return;
  }

  menu.insertAdjacentHTML(
    'beforeend',
    list
      .map((n) => {
        const icon =
          n.type === 'job_alert'
            ? 'bi-briefcase'
            : (n.title || '').toLowerCase().includes('hired')
              ? 'bi-trophy'
              : (n.title || '').toLowerCase().includes('shortlisted')
                ? 'bi-star'
                : 'bi-x-circle';
        const href = escHtml(n.link || '#');
        return `
        <li>
          <a class="dropdown-item notif-item ${n.is_read ? '' : 'notif-unread'}" href="${href}"
             data-notif-id="${n.id}" data-notif-link="${href}"
             onclick="return handleNotificationClick(event)">
            <div class="d-flex gap-2">
              <i class="bi ${icon} mt-1 text-primary" aria-hidden="true"></i>
              <div class="flex-grow-1">
                <div class="fw-semibold small">${escHtml(n.title)}</div>
                <div class="small text-muted">${escHtml(n.message)}</div>
                <div class="text-muted" style="font-size:0.75rem">${timeAgoShort(n.created_at)}</div>
              </div>
            </div>
          </a>
        </li>`;
      })
      .join('')
  );
}

async function handleNotificationClick(event) {
  event.preventDefault();
  const el = event.currentTarget;
  const id = el.getAttribute('data-notif-id');
  const link = el.getAttribute('data-notif-link');
  try {
    if (id) await api.markNotificationRead(id);
  } catch (_) {}
  if (link && link !== '#') window.location.href = link;
  else notificationPoller.refresh(true);
  return false;
}

async function markAllNotificationsRead(event) {
  if (event) event.preventDefault();
  try {
    await api.markAllNotificationsRead();
    await notificationPoller.refresh(true);
    showToast('All notifications marked as read', 'info');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function formatJobTypeLabel(type) {
  const map = {
    'full-time': 'Full-time',
    'part-time': 'Part-time',
    'short-term': 'Short-term',
    contract: 'Contract',
    remote: 'Remote',
  };
  return map[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : '—');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days/7)} weeks ago`;
  return `${Math.floor(days/30)} months ago`;
}

function badgeClass(type) {
  const map = {
    'full-time': 'badge-full-time',
    'part-time': 'badge-part-time',
    'short-term': 'badge-short-term',
    'contract': 'badge-contract',
    'remote': 'badge-remote',
  };
  return map[type] || 'bg-secondary text-white';
}

function updateNavAuth() {
  const user = api.getUser();
  const navAuth = document.getElementById('navAuth');
  if (!navAuth) return;

  document.body.classList.toggle('is-student', !!(user && user.role === 'student'));

  if (user) {
    const safeName = String(user.name || 'Account').replace(/</g, '&lt;');
    const notifBell =
      user.role === 'student'
        ? `
      <li class="nav-item dropdown me-1">
        <a class="nav-link position-relative notif-bell" href="#" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Notifications" id="notifBellBtn">
          <i class="bi bi-bell fs-5" aria-hidden="true"></i>
          <span id="notifBadge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none">0</span>
        </a>
        <ul class="dropdown-menu dropdown-menu-end shadow notif-dropdown" id="notifMenu">
          <li class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
            <span class="fw-semibold small">Notifications</span>
            <a href="#" class="small" onclick="markAllNotificationsRead(event)">Mark all read</a>
          </li>
        </ul>
      </li>`
        : '';

    navAuth.innerHTML = `
      ${notifBell}
      <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle fw-semibold" href="#" data-bs-toggle="dropdown" aria-expanded="false">
          <i class="bi bi-person-circle me-1" aria-hidden="true"></i>${safeName}
        </a>
        <ul class="dropdown-menu dropdown-menu-end shadow">
          <li><a class="dropdown-item" href="/profile.html"><i class="bi bi-person me-2"></i>My Profile</a></li>
          ${user.role === 'student' ? `
          <li><a class="dropdown-item" href="/profile.html" onclick="localStorage.setItem('profileTab','applications')"><i class="bi bi-file-earmark-text me-2"></i>My Applications</a></li>
          <li><a class="dropdown-item" href="/profile.html#bookmarks" onclick="localStorage.setItem('profileTab','bookmarks')"><i class="bi bi-bookmark me-2"></i>Saved Jobs</a></li>
          ` : ''}
          ${user.role === 'admin' ? '<li><a class="dropdown-item" href="/admin.html"><i class="bi bi-shield-lock me-2"></i>Admin Dashboard</a></li>' : ''}
          ${user.role === 'employer' ? '<li><a class="dropdown-item" href="/employer.html"><i class="bi bi-briefcase me-2"></i>Employer Dashboard</a></li><li><a class="dropdown-item" href="/post-job.html"><i class="bi bi-plus-circle me-2"></i>Post a Job</a></li>' : ''}
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item text-danger" href="#" onclick="api.logout()"><i class="bi bi-box-arrow-right me-2"></i>Logout</a></li>
        </ul>
      </li>
    `;

    if (user.role === 'student') notificationPoller.start();
    else notificationPoller.stop();
  } else {
    notificationPoller.stop();
    navAuth.innerHTML = `
      <li class="nav-item"><a class="nav-link" href="/login.html">Login</a></li>
      <li class="nav-item"><a class="btn btn-primary ms-lg-2" href="/register.html">Sign Up</a></li>
    `;
  }
}
