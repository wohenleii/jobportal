/**
 * API utility — centralizes all fetch calls to the backend.
 */
const API_BASE = 'http://localhost:5000/api';

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
  },

  /** Check if user is logged in */
  isLoggedIn() {
    return !!this.getToken();
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

  async deleteUser(id) {
    return this.delete(`/admin/users/${id}`);
  },

  async getAdminJobs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/admin/jobs?${qs}`);
  },

  async updateJobStatus(id, status) {
    return this.put(`/admin/jobs/${id}/status`, { status });
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
  const fmt = n => n >= 1000 ? `$${(n/1000).toFixed(0)}k` : `$${n}/hr`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
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
    'internship': 'badge-internship',
    'short-term': 'badge-internship',
    'contract': 'badge-contract',
    'remote': 'badge-remote',
  };
  return map[type] || 'bg-secondary text-white';
}

function updateNavAuth() {
  const user = api.getUser();
  const navAuth = document.getElementById('navAuth');
  if (!navAuth) return;

  if (user) {
    navAuth.innerHTML = `
      <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle fw-semibold" href="#" data-bs-toggle="dropdown">
          👤 ${user.name}
        </a>
        <ul class="dropdown-menu dropdown-menu-end">
          <li><a class="dropdown-item" href="/profile.html">My Profile</a></li>
          ${user.role === 'admin' ? '<li><a class="dropdown-item" href="/admin.html">Admin Dashboard</a></li>' : ''}
          ${user.role === 'employer' ? '<li><a class="dropdown-item" href="/post-job.html">Post a Job</a></li>' : ''}
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item text-danger" href="#" onclick="api.logout()">Logout</a></li>
        </ul>
      </li>
    `;
  } else {
    navAuth.innerHTML = `
      <li class="nav-item"><a class="nav-link" href="/login.html">Login</a></li>
      <li class="nav-item"><a class="btn btn-primary ms-2" href="/register.html">Sign Up</a></li>
    `;
  }
}
