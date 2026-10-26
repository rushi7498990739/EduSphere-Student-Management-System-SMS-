// ===========================
// Global State
// ===========================
let currentUser = null;
let currentClass = null;
let currentAssignment = null;
let currentChatUser = null;
let calendarDate = new Date();
let allEvents = [];
let allUsers = [];
let notifInterval = null;
let msgInterval = null;
let attendanceData = {};

const API = '';

// ===========================
// Utility Functions
// ===========================
async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(API + path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function formatDate(d) {
  if (!d) return 'No due date';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getInitials(name) {
  return (name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function getGradeClass(pct) {
  if (pct >= 90) return 'a';
  if (pct >= 80) return 'b';
  if (pct >= 70) return 'c';
  return 'd';
}

// ===========================
// Auth Functions
// ===========================
function showLogin() {
  document.getElementById('login-form').classList.add('active');
  document.getElementById('register-form').classList.remove('active');
}

function showRegister() {
  document.getElementById('register-form').classList.add('active');
  document.getElementById('login-form').classList.remove('active');
}

function fillDemo(email, pass) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = pass;
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return showToast('Please fill all fields', 'error');
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    initApp();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function register() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  const phone = document.getElementById('reg-phone').value.trim();
  if (!name || !email || !password) return showToast('Please fill all required fields', 'error');
  try {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role, phone }) });
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    initApp();
    showToast('Account created!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  clearInterval(notifInterval);
  clearInterval(msgInterval);
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('auth-container').style.display = 'flex';
  showLogin();
}

// ===========================
// App Init
// ===========================
async function initApp() {
  try {
    if (!currentUser) {
      const token = localStorage.getItem('token');
      if (!token) return;
      currentUser = await api('/api/auth/me');
    }

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').classList.remove('hidden');

    // Set user info in sidebar
    document.getElementById('sidebar-name').textContent = currentUser.name;
    document.getElementById('sidebar-role').textContent = currentUser.role;
    document.getElementById('sidebar-role').className = `role-badge ${currentUser.role}`;
    document.getElementById('sidebar-avatar').textContent = getInitials(currentUser.name);
    document.getElementById('composer-avatar').textContent = getInitials(currentUser.name);

    // Show/hide role-specific elements
    if (currentUser.role === 'teacher' || currentUser.role === 'admin') {
      document.querySelectorAll('.teacher-only').forEach(el => el.classList.remove('hidden'));
      document.querySelectorAll('.student-only').forEach(el => el.classList.add('hidden'));
    } else {
      document.querySelectorAll('.student-only').forEach(el => el.classList.remove('hidden'));
      document.querySelectorAll('.teacher-only').forEach(el => el.classList.add('hidden'));
    }

    if (currentUser.role === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
      document.querySelectorAll('.teacher-only').forEach(el => el.classList.remove('hidden'));
    } else {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }

    // Load people for messaging
    allUsers = await api('/api/people');

    // Start polling notifications
    loadNotifications();
    notifInterval = setInterval(loadNotifications, 30000);

    showPage('dashboard');
  } catch (err) {
    console.error(err);
    localStorage.removeItem('token');
  }
}

// ===========================
// Navigation
// ===========================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    classes: 'My Classes',
    assignments: 'Assignments',
    grades: 'Grades',
    attendance: 'Attendance',
    calendar: 'Calendar',
    messages: 'Messages',
    admin: 'Admin Panel',
    profile: 'Profile',
    'class-detail': 'Class',
    'assignment-detail': 'Assignment',
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  // Load page data
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'classes': loadClasses(); break;
    case 'assignments': loadAllAssignments(); break;
    case 'grades': loadGradesPage(); break;
    case 'attendance': loadAttendanceOverview(); break;
    case 'calendar': loadCalendar(); break;
    case 'messages': loadMessages(); break;
    case 'admin': loadAdmin(); break;
    case 'profile': loadProfile(); break;
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
  } else {
    sidebar.classList.toggle('collapsed');
    const topbar = document.querySelector('.topbar');
    const main = document.querySelector('.main-content');
    if (sidebar.classList.contains('collapsed')) {
      topbar.style.left = '64px';
      main.style.marginLeft = '64px';
    } else {
      topbar.style.left = 'var(--sidebar-width)';
      main.style.marginLeft = 'var(--sidebar-width)';
    }
  }
}

// ===========================
// Modals
// ===========================
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

// ===========================
// Dashboard
// ===========================
async function loadDashboard() {
  try {
    const [classes, assignments] = await Promise.all([
      api('/api/classes'),
      api('/api/classes').then(cls => Promise.all(cls.map(c => api(`/api/classes/${c.id}/assignments`).then(a => a.map(x => ({ ...x, class_name: c.name, class_id: c.id, class_color: c.cover_color }))))))
        .then(all => all.flat().sort((a, b) => new Date(a.due_date) - new Date(b.due_date)))
    ]);

    const statsGrid = document.getElementById('stats-grid');
    if (currentUser.role === 'admin') {
      try {
        const stats = await api('/api/admin/stats');
        statsGrid.innerHTML = `
          <div class="stat-card"><div class="stat-icon blue"><span class="material-icons">people</span></div><div class="stat-info"><h3>${stats.total_students}</h3><p>Students</p></div></div>
          <div class="stat-card"><div class="stat-icon green"><span class="material-icons">school</span></div><div class="stat-info"><h3>${stats.total_teachers}</h3><p>Teachers</p></div></div>
          <div class="stat-card"><div class="stat-icon yellow"><span class="material-icons">class</span></div><div class="stat-info"><h3>${stats.total_classes}</h3><p>Classes</p></div></div>
          <div class="stat-card"><div class="stat-icon red"><span class="material-icons">assignment</span></div><div class="stat-info"><h3>${stats.total_assignments}</h3><p>Assignments</p></div></div>
        `;
      } catch {}
    } else {
      statsGrid.innerHTML = `
        <div class="stat-card"><div class="stat-icon blue"><span class="material-icons">class</span></div><div class="stat-info"><h3>${classes.length}</h3><p>My Classes</p></div></div>
        <div class="stat-card"><div class="stat-icon green"><span class="material-icons">assignment</span></div><div class="stat-info"><h3>${assignments.length}</h3><p>Total Work</p></div></div>
        <div class="stat-card"><div class="stat-icon yellow"><span class="material-icons">pending_actions</span></div><div class="stat-info"><h3>${assignments.filter(a => a.due_date && new Date(a.due_date) > new Date()).length}</h3><p>Upcoming</p></div></div>
        <div class="stat-card"><div class="stat-icon red"><span class="material-icons">notification_important</span></div><div class="stat-info"><h3>${assignments.filter(a => a.due_date && new Date(a.due_date) < new Date()).length}</h3><p>Past Due</p></div></div>
      `;
    }

    // Classes list
    const dashClasses = document.getElementById('dash-classes');
    dashClasses.innerHTML = classes.slice(0, 5).map(c => `
      <div class="dash-list-item" onclick="openClass('${c.id}')">
        <div class="dash-icon" style="background:${c.cover_color}">${getInitials(c.name)}</div>
        <div class="dash-info">
          <strong>${c.name}</strong>
          <span>${c.teacher_name}${c.section ? ` · ${c.section}` : ''}</span>
        </div>
        <span style="font-size:0.8rem;color:var(--text-secondary)">${c.student_count} students</span>
      </div>
    `).join('') || '<div class="empty-state"><span class="material-icons">class</span><p>No classes yet</p></div>';

    // Upcoming work
    const dashAssign = document.getElementById('dash-assignments');
    const upcoming = assignments.filter(a => a.type !== 'material').slice(0, 5);
    dashAssign.innerHTML = upcoming.map(a => `
      <div class="dash-list-item" onclick="openAssignment('${a.id}', '${a.class_id}')">
        <div class="dash-icon" style="background:${a.class_color || '#1a73e8'}">${a.type === 'quiz' ? 'Q' : 'A'}</div>
        <div class="dash-info">
          <strong>${a.title}</strong>
          <span>${a.class_name}</span>
        </div>
        <span class="dash-due">${a.due_date ? formatDate(a.due_date) : 'No due date'}</span>
      </div>
    `).join('') || '<div class="empty-state"><span class="material-icons">assignment</span><p>No upcoming work</p></div>';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Classes
// ===========================
async function loadClasses() {
  const grid = document.getElementById('classes-grid');
  grid.innerHTML = '<div class="loading"><div class="spinner"></div> Loading classes...</div>';
  try {
    const classes = await api('/api/classes');
    if (!classes.length) {
      grid.innerHTML = `<div class="empty-state"><span class="material-icons">class</span><p>${currentUser.role === 'student' ? 'Join a class with a class code' : 'Create your first class'}</p></div>`;
      return;
    }
    grid.innerHTML = classes.map(c => `
      <div class="class-card" onclick="openClass('${c.id}')">
        <div class="class-card-header" style="background: linear-gradient(135deg, ${c.cover_color}, ${c.cover_color}dd)">
          <div>
            <div class="class-card-title">${c.name}</div>
            <div class="class-card-section">${c.section || ''}</div>
          </div>
          <div class="class-card-subject">${c.subject || ''}</div>
        </div>
        <div class="class-card-body">
          <div class="class-card-info"><span class="material-icons">person</span>${c.teacher_name}</div>
          <div class="class-card-info"><span class="material-icons">people</span>${c.student_count} students</div>
          ${c.description ? `<div class="class-card-info"><span class="material-icons">info</span>${c.description.substring(0, 60)}${c.description.length > 60 ? '...' : ''}</div>` : ''}
        </div>
        <div class="class-card-footer">
          <span class="class-code-chip">Code: ${c.class_code}</span>
          ${currentUser.role !== 'student' ? `<button class="btn btn-outline" style="padding:4px 10px;font-size:0.75rem;" onclick="event.stopPropagation();deleteClass('${c.id}')">Archive</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function createClass() {
  const name = document.getElementById('cls-name').value.trim();
  const section = document.getElementById('cls-section').value.trim();
  const subject = document.getElementById('cls-subject').value.trim();
  const description = document.getElementById('cls-desc').value.trim();
  const cover_color = document.getElementById('cls-color').value;
  if (!name) return showToast('Class name is required', 'error');
  try {
    await api('/api/classes', { method: 'POST', body: JSON.stringify({ name, section, subject, description, cover_color }) });
    hideModal('create-class-modal');
    ['cls-name','cls-section','cls-subject','cls-desc'].forEach(id => document.getElementById(id).value = '');
    showToast('Class created!', 'success');
    loadClasses();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function joinClass() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code) return showToast('Enter a class code', 'error');
  try {
    await api('/api/classes/join', { method: 'POST', body: JSON.stringify({ class_code: code }) });
    hideModal('join-class-modal');
    document.getElementById('join-code').value = '';
    showToast('Joined class!', 'success');
    loadClasses();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteClass(id) {
  if (!confirm('Archive this class?')) return;
  try {
    await api(`/api/classes/${id}`, { method: 'DELETE' });
    showToast('Class archived', 'success');
    loadClasses();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Class Detail
// ===========================
async function openClass(classId) {
  currentClass = await api(`/api/classes/${classId}`);
  showPage('class-detail');

  const header = document.getElementById('class-detail-header');
  header.style.background = `linear-gradient(135deg, ${currentClass.cover_color}, ${currentClass.cover_color}cc)`;
  document.getElementById('class-detail-name').textContent = currentClass.name;
  document.getElementById('class-detail-subject').textContent = `${currentClass.subject || ''} ${currentClass.section ? '· ' + currentClass.section : ''} · ${currentClass.teacher_name}`;

  switchTab('stream');

  // Set today's attendance date
  document.getElementById('attendance-date').value = new Date().toISOString().split('T')[0];
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');

  if (!currentClass) return;
  switch (tab) {
    case 'stream': loadStream(); break;
    case 'classwork': loadClasswork(); break;
    case 'people': loadPeople(); break;
    case 'grades-tab': loadClassGrades(); break;
    case 'attendance-tab': loadAttendance(); break;
  }
}

// ===========================
// Stream
// ===========================
async function loadStream() {
  const list = document.getElementById('stream-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const posts = await api(`/api/classes/${currentClass.id}/announcements`);
    if (!posts.length) {
      list.innerHTML = '<div class="empty-state"><span class="material-icons">dynamic_feed</span><p>No posts yet. Share something with your class!</p></div>';
      return;
    }
    list.innerHTML = posts.map(p => `
      <div class="stream-post" id="post-${p.id}">
        <div class="post-header">
          <div class="post-avatar">${getInitials(p.author_name)}</div>
          <div class="post-meta">
            <strong>${p.author_name}</strong>
            <span>${timeAgo(p.created_at)}</span>
          </div>
          ${p.author_id === currentUser.id || currentUser.role !== 'student' ? `
            <button onclick="deletePost('${p.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-secondary)"><span class="material-icons">delete</span></button>
          ` : ''}
        </div>
        <div class="post-content">${p.content.replace(/\n/g, '<br>')}</div>
        ${p.attachment ? `<div class="post-attachment"><a href="${p.attachment}" target="_blank"><span class="material-icons">attach_file</span> Attachment</a></div>` : ''}
        <div class="post-actions">
          <button class="btn btn-outline" style="padding:6px 12px;font-size:0.8rem;" onclick="toggleComments('${p.id}')">
            <span class="material-icons" style="font-size:1rem">comment</span> ${p.comment_count} comments
          </button>
        </div>
        <div id="comments-${p.id}" class="post-comments" style="display:none">
          <div id="comment-list-${p.id}"></div>
          <div class="comment-input-row">
            <input type="text" placeholder="Add a comment..." id="comment-input-${p.id}" onkeypress="if(event.key==='Enter')addComment('${p.id}')" />
            <button onclick="addComment('${p.id}')">Post</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleComments(postId) {
  const div = document.getElementById(`comments-${postId}`);
  if (div.style.display === 'none') {
    div.style.display = 'block';
    const comments = await api(`/api/announcements/${postId}/comments`);
    const listEl = document.getElementById(`comment-list-${postId}`);
    listEl.innerHTML = comments.map(c => `
      <div class="comment">
        <div class="comment-avatar">${getInitials(c.author_name)}</div>
        <div class="comment-body">
          <strong>${c.author_name}</strong>
          <p>${c.content}</p>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-secondary);font-size:0.85rem;">No comments yet</p>';
  } else {
    div.style.display = 'none';
  }
}

async function addComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) return;
  try {
    await api(`/api/announcements/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
    input.value = '';
    // Refresh comments
    const comments = await api(`/api/announcements/${postId}/comments`);
    const listEl = document.getElementById(`comment-list-${postId}`);
    listEl.innerHTML = comments.map(c => `
      <div class="comment">
        <div class="comment-avatar">${getInitials(c.author_name)}</div>
        <div class="comment-body"><strong>${c.author_name}</strong><p>${c.content}</p></div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function expandComposer(el) {
  const actions = el.nextElementSibling;
  if (actions) actions.classList.remove('hidden');
  document.getElementById('announce-input').focus();
}

async function postAnnouncement() {
  const content = document.getElementById('announce-input').value.trim();
  if (!content) return showToast('Please enter a message', 'error');
  try {
    await api(`/api/classes/${currentClass.id}/announcements`, { method: 'POST', body: JSON.stringify({ content }) });
    document.getElementById('announce-input').value = '';
    showToast('Posted!', 'success');
    loadStream();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  try {
    await api(`/api/announcements/${id}`, { method: 'DELETE' });
    document.getElementById(`post-${id}`)?.remove();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Classwork
// ===========================
async function loadClasswork() {
  const list = document.getElementById('classwork-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const assignments = await api(`/api/classes/${currentClass.id}/assignments`);
    if (!assignments.length) {
      list.innerHTML = '<div class="empty-state"><span class="material-icons">assignment</span><p>No assignments yet</p></div>';
      return;
    }
    const icons = { assignment: 'assignment', quiz: 'quiz', material: 'menu_book', question: 'help_outline' };
    list.innerHTML = assignments.map(a => `
      <div class="classwork-item" onclick="openAssignment('${a.id}', '${currentClass.id}')">
        <div class="classwork-icon ${a.type}">
          <span class="material-icons">${icons[a.type] || 'assignment'}</span>
        </div>
        <div class="classwork-info">
          <h4>${a.title}</h4>
          <p>${a.description ? a.description.substring(0, 80) + '...' : 'No description'}</p>
        </div>
        <div class="classwork-meta">
          <div>${a.max_points} pts</div>
          <div>${a.due_date ? formatDate(a.due_date) : 'No due date'}</div>
        </div>
        ${currentUser.role !== 'student' ? `
          <button onclick="event.stopPropagation();deleteAssignment('${a.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-secondary)">
            <span class="material-icons">delete</span>
          </button>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAssignment(id) {
  if (!confirm('Delete this assignment?')) return;
  try {
    await api(`/api/assignments/${id}`, { method: 'DELETE' });
    showToast('Deleted', 'success');
    loadClasswork();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showCreateAssignment() {
  showModal('create-assignment-modal');
}

async function createAssignment() {
  const title = document.getElementById('assign-title').value.trim();
  const description = document.getElementById('assign-desc').value.trim();
  const due_date = document.getElementById('assign-due').value;
  const max_points = document.getElementById('assign-points').value;
  const type = document.getElementById('assign-type').value;
  const file = document.getElementById('assign-file').files[0];

  if (!title) return showToast('Title required', 'error');
  if (!currentClass) return;

  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('due_date', due_date);
    formData.append('max_points', max_points);
    formData.append('type', type);
    if (file) formData.append('attachment', file);

    await fetch(`/api/classes/${currentClass.id}/assignments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: formData,
    }).then(r => r.json());

    hideModal('create-assignment-modal');
    document.getElementById('assign-title').value = '';
    document.getElementById('assign-desc').value = '';
    document.getElementById('assign-due').value = '';
    document.getElementById('assign-file').value = '';
    showToast('Assignment created!', 'success');
    loadClasswork();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Assignment Detail
// ===========================
async function openAssignment(assignmentId, classId) {
  currentAssignment = await api(`/api/assignments/${assignmentId}`);
  showPage('assignment-detail');

  document.getElementById('assignment-detail-title').textContent = currentAssignment.title;
  document.getElementById('assignment-detail-points').textContent = `${currentAssignment.max_points} points`;
  document.getElementById('assignment-detail-due').textContent = currentAssignment.due_date ? `Due: ${formatDateTime(currentAssignment.due_date)}` : 'No due date';
  document.getElementById('assignment-detail-desc').textContent = currentAssignment.description || 'No description';

  const attLink = document.getElementById('assignment-attachment-link');
  attLink.innerHTML = currentAssignment.attachment ? `<a href="${currentAssignment.attachment}" target="_blank" class="btn btn-outline"><span class="material-icons">attach_file</span> View Attachment</a>` : '';

  if (currentUser.role === 'student') {
    const sub = await api(`/api/assignments/${assignmentId}/my-submission`);
    const statusEl = document.getElementById('my-submission-status');
    if (sub) {
      document.getElementById('submission-content').value = sub.content || '';
      statusEl.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
          <span class="status-chip ${sub.status}">${sub.status}</span>
          ${sub.grade !== null ? `<strong style="color:var(--secondary)">${sub.grade}/${currentAssignment.max_points}</strong>` : ''}
          ${sub.feedback ? `<span style="color:var(--text-secondary);font-size:0.85rem">${sub.feedback}</span>` : ''}
        </div>
      `;
    } else {
      statusEl.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:12px;">Not submitted yet</p>';
    }
  }

  if (currentUser.role !== 'student') {
    loadSubmissions(assignmentId);
  }
}

function goBackFromAssignment() {
  if (currentClass) {
    showPage('class-detail');
    switchTab('classwork');
  } else {
    showPage('assignments');
  }
}

async function submitAssignment() {
  if (!currentAssignment) return;
  const content = document.getElementById('submission-content').value.trim();
  const file = document.getElementById('submission-file').files[0];

  try {
    const formData = new FormData();
    formData.append('content', content);
    if (file) formData.append('attachment', file);

    const res = await fetch(`/api/assignments/${currentAssignment.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Submitted!', 'success');
    openAssignment(currentAssignment.id, currentAssignment.class_id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadSubmissions(assignmentId) {
  const list = document.getElementById('submissions-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const subs = await api(`/api/assignments/${assignmentId}/submissions`);
    if (!subs.length) {
      list.innerHTML = '<p style="color:var(--text-secondary)">No submissions yet</p>';
      return;
    }
    list.innerHTML = subs.map(s => `
      <div class="submission-item">
        <div class="avatar">${getInitials(s.student_name)}</div>
        <div class="submission-info">
          <strong>${s.student_name}</strong>
          <p>${s.student_email}</p>
          ${s.content ? `<p class="sub-content">${s.content.substring(0, 100)}</p>` : ''}
          ${s.attachment ? `<a href="${s.attachment}" target="_blank" style="font-size:0.8rem;color:var(--primary)">View attachment</a>` : ''}
          <p style="font-size:0.75rem;color:var(--text-secondary)">${formatDateTime(s.submitted_at)}</p>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <span class="status-chip ${s.status}">${s.status}</span>
          ${s.grade !== null ? `<strong>${s.grade}/${currentAssignment?.max_points}</strong>` : ''}
          <button class="btn btn-primary" style="padding:6px 12px;font-size:0.8rem;" onclick="openGradeModal('${s.id}', '${s.student_name}', ${s.grade || 0}, '${s.feedback || ''}')">
            ${s.grade !== null ? 'Edit Grade' : 'Grade'}
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

let gradingSubmissionId = null;

function openGradeModal(subId, studentName, currentGrade, currentFeedback) {
  gradingSubmissionId = subId;
  document.getElementById('grade-submission-info').innerHTML = `<p><strong>Student:</strong> ${studentName}</p>`;
  document.getElementById('grade-points').value = currentGrade || '';
  document.getElementById('grade-points').max = currentAssignment?.max_points || 100;
  document.getElementById('grade-feedback').value = currentFeedback || '';
  showModal('grade-modal');
}

async function submitGrade() {
  const grade = parseInt(document.getElementById('grade-points').value);
  const feedback = document.getElementById('grade-feedback').value.trim();
  try {
    await api(`/api/submissions/${gradingSubmissionId}/grade`, { method: 'PUT', body: JSON.stringify({ grade, feedback }) });
    hideModal('grade-modal');
    showToast('Grade saved!', 'success');
    loadSubmissions(currentAssignment.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// People (Class Members)
// ===========================
async function loadPeople() {
  const list = document.getElementById('people-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const students = await api(`/api/classes/${currentClass.id}/students`);
    list.innerHTML = `
      <div class="people-section">
        <h3>Teacher</h3>
        <div class="person-item">
          <div class="avatar">${getInitials(currentClass.teacher_name)}</div>
          <div class="person-info">
            <strong>${currentClass.teacher_name}</strong>
            <span>${currentClass.teacher_email}</span>
          </div>
        </div>
      </div>
      <div class="people-section" style="margin-top:16px;">
        <h3>Students (${students.length})</h3>
        ${students.map(s => `
          <div class="person-item">
            <div class="avatar" style="background:var(--secondary)">${getInitials(s.name)}</div>
            <div class="person-info">
              <strong>${s.name}</strong>
              <span>${s.email}</span>
            </div>
            <button class="btn btn-outline" style="padding:4px 10px;font-size:0.8rem;" onclick="openChatWith('${s.id}', '${s.name}')">
              <span class="material-icons" style="font-size:1rem">chat</span>
            </button>
            ${currentUser.role !== 'student' ? `
              <button onclick="removeStudent('${s.id}', '${s.name}')" style="background:none;border:none;cursor:pointer;color:var(--danger);margin-left:4px">
                <span class="material-icons">person_remove</span>
              </button>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeStudent(studentId, name) {
  if (!confirm(`Remove ${name} from the class?`)) return;
  try {
    await api(`/api/classes/${currentClass.id}/students/${studentId}`, { method: 'DELETE' });
    showToast('Student removed', 'success');
    loadPeople();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Grades (Class)
// ===========================
async function loadClassGrades() {
  const el = document.getElementById('class-grades-list');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const grades = await api(`/api/classes/${currentClass.id}/grades`);
    if (currentUser.role === 'student') {
      el.innerHTML = `
        <table class="grades-table">
          <thead><tr><th>Assignment</th><th>Points</th><th>Grade</th><th>Status</th><th>Feedback</th></tr></thead>
          <tbody>
            ${grades.map(g => `
              <tr>
                <td><strong>${g.title}</strong><br><small style="color:var(--text-secondary)">${g.due_date ? formatDate(g.due_date) : ''}</small></td>
                <td>${g.max_points}</td>
                <td>${g.grade !== null ? `<strong style="color:var(--secondary)">${g.grade}</strong>` : '-'}</td>
                <td><span class="status-chip ${g.status || 'not-submitted'}">${g.status || 'not submitted'}</span></td>
                <td style="color:var(--text-secondary);font-size:0.85rem">${g.feedback || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      el.innerHTML = `
        <table class="grades-table">
          <thead><tr><th>Student</th><th>Submitted</th><th>Graded</th><th>Average</th></tr></thead>
          <tbody>
            ${grades.map(g => {
              const pct = g.avg_percent ? Math.round(g.avg_percent) : null;
              return `
                <tr>
                  <td><strong>${g.name}</strong></td>
                  <td>${g.submitted}</td>
                  <td>${g.graded}</td>
                  <td>${pct !== null ? `<span class="grade-circle ${getGradeClass(pct)}">${pct}%</span>` : '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Attendance
// ===========================
async function loadAttendance() {
  const date = document.getElementById('attendance-date').value;
  if (!date || !currentClass) return;

  const list = document.getElementById('attendance-list');
  try {
    const [students, records] = await Promise.all([
      api(`/api/classes/${currentClass.id}/students`),
      api(`/api/classes/${currentClass.id}/attendance?date=${date}`)
    ]);

    attendanceData = {};
    records.forEach(r => { attendanceData[r.student_id] = r.status; });

    if (!students.length) {
      list.innerHTML = '<div class="empty-state"><p>No students in this class</p></div>';
      return;
    }

    list.innerHTML = students.map(s => {
      const status = attendanceData[s.id] || 'present';
      return `
        <div class="attendance-row" id="att-row-${s.id}">
          <div class="avatar">${getInitials(s.name)}</div>
          <div class="student-name">${s.name}</div>
          <div class="attendance-options">
            ${['present','absent','late','excused'].map(st => `
              <button class="att-btn ${st} ${status === st ? 'active' : ''}"
                onclick="setAttendance('${s.id}', '${st}')">
                ${st.charAt(0).toUpperCase() + st.slice(1)}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setAttendance(studentId, status) {
  attendanceData[studentId] = status;
  const row = document.getElementById(`att-row-${studentId}`);
  row.querySelectorAll('.att-btn').forEach(btn => btn.classList.remove('active'));
  row.querySelector(`.att-btn.${status}`).classList.add('active');
}

async function saveAttendance() {
  const date = document.getElementById('attendance-date').value;
  if (!date) return showToast('Select a date', 'error');
  const records = Object.entries(attendanceData).map(([student_id, status]) => ({ student_id, status }));
  if (!records.length) return showToast('No attendance data', 'error');
  try {
    await api(`/api/classes/${currentClass.id}/attendance`, { method: 'POST', body: JSON.stringify({ records, date }) });
    showToast('Attendance saved!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// All Assignments Page
// ===========================
async function loadAllAssignments() {
  const list = document.getElementById('all-assignments-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const classes = await api('/api/classes');
    const allAssignments = await Promise.all(
      classes.map(c => api(`/api/classes/${c.id}/assignments`).then(a => a.map(x => ({ ...x, class_name: c.name, class_id: c.id, class_color: c.cover_color }))))
    );
    const assignments = allAssignments.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!assignments.length) {
      list.innerHTML = '<div class="empty-state"><span class="material-icons">assignment</span><p>No assignments found</p></div>';
      return;
    }

    const icons = { assignment: 'assignment', quiz: 'quiz', material: 'menu_book', question: 'help_outline' };
    list.innerHTML = assignments.map(a => `
      <div class="classwork-item" onclick="currentClass=null;openAssignment('${a.id}', '${a.class_id}')">
        <div class="classwork-icon ${a.type}">
          <span class="material-icons">${icons[a.type] || 'assignment'}</span>
        </div>
        <div class="classwork-info">
          <h4>${a.title}</h4>
          <p>${a.class_name} · ${a.author_name}</p>
        </div>
        <div class="classwork-meta">
          <div>${a.max_points} pts</div>
          <div style="color:${a.due_date && new Date(a.due_date) < new Date() ? 'var(--danger)' : 'var(--text-secondary)'}">
            ${a.due_date ? formatDate(a.due_date) : 'No due date'}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Grades Page
// ===========================
async function loadGradesPage() {
  const el = document.getElementById('grades-content');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const classes = await api('/api/classes');
    if (!classes.length) {
      el.innerHTML = '<div class="empty-state"><span class="material-icons">grade</span><p>No classes found</p></div>';
      return;
    }

    if (currentUser.role === 'student') {
      const gradesPerClass = await Promise.all(classes.map(c =>
        api(`/api/classes/${c.id}/grades`).then(g => ({ class: c, grades: g }))
      ));

      el.innerHTML = gradesPerClass.map(({ class: c, grades }) => {
        const graded = grades.filter(g => g.grade !== null);
        const avg = graded.length ? Math.round(graded.reduce((s, g) => s + (g.grade / g.max_points * 100), 0) / graded.length) : null;
        return `
          <div class="card" style="margin-bottom:16px">
            <div class="card-header">
              <h3 style="color:${c.cover_color}">${c.name}</h3>
              ${avg !== null ? `<span class="grade-circle ${getGradeClass(avg)}" style="font-size:1rem;width:auto;padding:4px 12px;border-radius:20px">${avg}% avg</span>` : ''}
            </div>
            <table class="grades-table">
              <thead><tr><th>Assignment</th><th>Points</th><th>Grade</th><th>Status</th></tr></thead>
              <tbody>
                ${grades.map(g => `
                  <tr>
                    <td>${g.title}</td>
                    <td>${g.max_points}</td>
                    <td>${g.grade !== null ? `<strong style="color:var(--secondary)">${g.grade}</strong>` : '-'}</td>
                    <td><span class="status-chip ${g.status || ''}">${g.status || 'Not submitted'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('');
    } else {
      // Teacher: show grade overview per class
      el.innerHTML = `<p style="color:var(--text-secondary);margin-bottom:16px">Select a class to view grades, or use the Grades tab within a class.</p>
        <div class="classes-grid">
          ${classes.map(c => `
            <div class="class-card" onclick="openClass('${c.id}');setTimeout(()=>switchTab('grades-tab'),300)">
              <div class="class-card-header" style="background:${c.cover_color}">
                <div class="class-card-title">${c.name}</div>
                <div class="class-card-subject">${c.subject || ''}</div>
              </div>
              <div class="class-card-body">
                <div class="class-card-info"><span class="material-icons">people</span>${c.student_count} students</div>
              </div>
            </div>
          `).join('')}
        </div>`;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Attendance Overview
// ===========================
async function loadAttendanceOverview() {
  const el = document.getElementById('attendance-overview');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const classes = await api('/api/classes');
    if (!classes.length) {
      el.innerHTML = '<div class="empty-state"><span class="material-icons">fact_check</span><p>No classes found</p></div>';
      return;
    }

    const summaries = await Promise.all(classes.map(c =>
      api(`/api/classes/${c.id}/attendance/summary`).then(s => ({ class: c, summary: s }))
    ));

    el.innerHTML = summaries.map(({ class: c, summary }) => `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <h3 style="color:${c.cover_color}">${c.name}</h3>
          <button class="btn btn-outline" onclick="openClass('${c.id}');setTimeout(()=>switchTab('attendance-tab'),300)">Mark Attendance</button>
        </div>
        <table class="grades-table">
          <thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th><th>Total</th><th>Rate</th></tr></thead>
          <tbody>
            ${summary.map(s => {
              const rate = s.total ? Math.round((s.present / s.total) * 100) : 0;
              return `
                <tr>
                  <td><strong>${s.name}</strong></td>
                  <td style="color:var(--secondary)">${s.present}</td>
                  <td style="color:var(--danger)">${s.absent}</td>
                  <td style="color:var(--warning)">${s.late}</td>
                  <td style="color:var(--text-secondary)">${s.excused}</td>
                  <td>${s.total}</td>
                  <td><span class="grade-circle ${getGradeClass(rate)}">${rate}%</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Calendar
// ===========================
async function loadCalendar() {
  try {
    allEvents = await api('/api/events');
    renderCalendar();
    renderEventsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calendar-month-year').textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const today = new Date();

  const dayHeaders = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
    `<div class="cal-day-header">${d}</div>`
  ).join('');

  let days = '';

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    days += `<div class="cal-day other-month"><div class="day-num">${daysInPrevMonth - i}</div></div>`;
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const dayEvents = allEvents.filter(e => {
      const ed = new Date(e.start_date);
      return ed.getFullYear() === year && ed.getMonth() === month && ed.getDate() === d;
    });
    days += `
      <div class="cal-day ${isToday ? 'today' : ''}">
        <div class="day-num">${d}</div>
        ${dayEvents.slice(0, 3).map(e => `<div class="cal-event-dot" style="background:${e.type === 'exam' ? 'var(--danger)' : e.type === 'holiday' ? 'var(--secondary)' : 'var(--primary)'}"></div>`).join('')}
      </div>
    `;
  }

  // Fill remaining cells
  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    days += `<div class="cal-day other-month"><div class="day-num">${d}</div></div>`;
  }

  document.getElementById('calendar-grid').innerHTML = dayHeaders + days;
}

function renderEventsList() {
  const list = document.getElementById('events-list');
  const upcoming = allEvents.filter(e => new Date(e.start_date) >= new Date()).slice(0, 10);
  if (!upcoming.length) {
    list.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem">No upcoming events</p>';
    return;
  }
  list.innerHTML = upcoming.map(e => `
    <div class="event-item">
      <div class="event-dot ${e.type}"></div>
      <div>
        <strong style="font-size:0.9rem">${e.title}</strong>
        <div style="font-size:0.8rem;color:var(--text-secondary)">${formatDateTime(e.start_date)}</div>
        ${e.class_name ? `<div style="font-size:0.75rem;color:var(--text-secondary)">${e.class_name}</div>` : ''}
      </div>
      ${currentUser.role !== 'student' ? `
        <button onclick="deleteEvent('${e.id}')" style="background:none;border:none;cursor:pointer;color:var(--danger);margin-left:auto">
          <span class="material-icons" style="font-size:1rem">delete</span>
        </button>
      ` : ''}
    </div>
  `).join('');
}

function prevMonth() { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); }
function nextMonth() { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); }

async function createEvent() {
  const title = document.getElementById('event-title').value.trim();
  const type = document.getElementById('event-type').value;
  const start_date = document.getElementById('event-start').value;
  const end_date = document.getElementById('event-end').value;
  const description = document.getElementById('event-desc').value.trim();
  if (!title || !start_date) return showToast('Title and start date required', 'error');
  try {
    await api('/api/events', { method: 'POST', body: JSON.stringify({ title, type, start_date, end_date, description }) });
    hideModal('create-event-modal');
    showToast('Event created!', 'success');
    loadCalendar();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  try {
    await api(`/api/events/${id}`, { method: 'DELETE' });
    showToast('Event deleted', 'success');
    loadCalendar();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Messages
// ===========================
async function loadMessages() {
  const list = document.getElementById('conversations-list');
  try {
    const convs = await api('/api/messages/conversations/list');
    if (!convs.length) {
      list.innerHTML = '<p style="padding:16px;color:var(--text-secondary);font-size:0.9rem">No conversations yet. Start a new message!</p>';
      return;
    }
    list.innerHTML = convs.map(c => `
      <div class="conv-item ${currentChatUser?.id === c.id ? 'active' : ''}" onclick="openChat('${c.id}', '${c.name}', '${c.role}')">
        <div class="avatar" style="background:${c.role === 'teacher' ? 'var(--secondary)' : 'var(--primary)'}">${getInitials(c.name)}</div>
        <div class="conv-info">
          <strong>${c.name}</strong>
          <div class="last-msg">${c.last_message || 'No messages'}</div>
        </div>
        <div class="conv-meta">
          <div>${c.last_time ? timeAgo(c.last_time) : ''}</div>
          ${c.unread > 0 ? `<div class="badge" style="position:static;margin-top:4px">${c.unread}</div>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openChat(userId, userName, userRole) {
  currentChatUser = { id: userId, name: userName, role: userRole };

  document.querySelector('.chat-empty')?.classList.add('hidden');
  const chatWindow = document.getElementById('chat-window');
  chatWindow.classList.remove('hidden');

  document.getElementById('chat-header').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <div class="avatar" style="background:${userRole === 'teacher' ? 'var(--secondary)' : 'var(--primary)'};width:36px;height:36px;font-size:0.9rem">${getInitials(userName)}</div>
      <div>
        <strong>${userName}</strong>
        <div style="font-size:0.75rem;color:var(--text-secondary)">${userRole}</div>
      </div>
    </div>
  `;

  // Mark active
  document.querySelectorAll('.conv-item').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.conv-item').forEach(c => {
    if (c.onclick?.toString().includes(userId)) c.classList.add('active');
  });

  await loadChatMessages(userId);

  // Poll for new messages
  clearInterval(msgInterval);
  msgInterval = setInterval(() => { if (currentChatUser?.id === userId) loadChatMessages(userId); }, 5000);
}

async function loadChatMessages(userId) {
  try {
    const msgs = await api(`/api/messages/${userId}`);
    const container = document.getElementById('chat-messages');
    container.innerHTML = msgs.map(m => `
      <div class="msg-bubble ${m.sender_id === currentUser.id ? 'sent' : 'received'}">
        ${m.content}
        <span class="msg-time">${timeAgo(m.sent_at)}</span>
      </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
  } catch (err) {}
}

async function sendMessage() {
  if (!currentChatUser) return;
  const content = document.getElementById('chat-input').value.trim();
  if (!content) return;
  try {
    await api('/api/messages', { method: 'POST', body: JSON.stringify({ receiver_id: currentChatUser.id, content }) });
    document.getElementById('chat-input').value = '';
    await loadChatMessages(currentChatUser.id);
    loadMessages();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function showNewMessage() {
  const select = document.getElementById('message-to');
  select.innerHTML = allUsers.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('');
  showModal('new-message-modal');
}

async function sendNewMessage() {
  const receiver_id = document.getElementById('message-to').value;
  const content = document.getElementById('new-message-content').value.trim();
  if (!content) return showToast('Enter a message', 'error');
  try {
    await api('/api/messages', { method: 'POST', body: JSON.stringify({ receiver_id, content }) });
    hideModal('new-message-modal');
    document.getElementById('new-message-content').value = '';
    const user = allUsers.find(u => u.id === receiver_id);
    if (user) openChat(user.id, user.name, user.role);
    loadMessages();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openChatWith(userId, userName) {
  const user = allUsers.find(u => u.id === userId);
  showPage('messages');
  setTimeout(() => openChat(userId, userName, user?.role || 'student'), 300);
}

// ===========================
// Notifications
// ===========================
async function loadNotifications() {
  try {
    const notifs = await api('/api/notifications');
    const unread = notifs.filter(n => !n.is_read).length;
    const badge = document.getElementById('notif-badge');
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    const list = document.getElementById('notif-list');
    if (!notifs.length) {
      list.innerHTML = '<div class="empty-state" style="padding:24px"><span class="material-icons">notifications_none</span><p>No notifications</p></div>';
      return;
    }

    const icons = { assignment: 'assignment', grade: 'grade', submission: 'send', info: 'info' };
    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="readNotif('${n.id}')">
        <div class="notif-item-icon"><span class="material-icons">${icons[n.type] || 'notifications'}</span></div>
        <div class="notif-item-body">
          <h4>${n.title}</h4>
          <p>${n.message}</p>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {}
}

function toggleNotifications() {
  document.getElementById('notif-dropdown').classList.toggle('hidden');
}

async function markAllRead() {
  try {
    await api('/api/notifications/read-all', { method: 'PUT' });
    loadNotifications();
  } catch {}
}

async function readNotif(id) {
  await api(`/api/notifications/${id}/read`, { method: 'PUT' }).catch(() => {});
  loadNotifications();
}

// Close notifications on outside click
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notif-dropdown');
  const btn = document.querySelector('.notif-btn');
  if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// ===========================
// Admin Panel
// ===========================
async function loadAdmin() {
  try {
    const [stats, users] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/users'),
    ]);

    document.getElementById('admin-stats').innerHTML = `
      <div class="stat-card"><div class="stat-icon blue"><span class="material-icons">people</span></div><div class="stat-info"><h3>${stats.total_students}</h3><p>Students</p></div></div>
      <div class="stat-card"><div class="stat-icon green"><span class="material-icons">school</span></div><div class="stat-info"><h3>${stats.total_teachers}</h3><p>Teachers</p></div></div>
      <div class="stat-card"><div class="stat-icon yellow"><span class="material-icons">class</span></div><div class="stat-info"><h3>${stats.total_classes}</h3><p>Classes</p></div></div>
      <div class="stat-card"><div class="stat-icon red"><span class="material-icons">assignment</span></div><div class="stat-info"><h3>${stats.total_assignments}</h3><p>Assignments</p></div></div>
      <div class="stat-card"><div class="stat-icon blue"><span class="material-icons">send</span></div><div class="stat-info"><h3>${stats.total_submissions}</h3><p>Submissions</p></div></div>
    `;

    // Populate users table
    window._adminUsers = users;
    renderUsersTable(users);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderUsersTable(users) {
  document.getElementById('users-tbody').innerHTML = users.map(u => `
    <tr>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar" style="width:32px;height:32px;font-size:0.8rem">${getInitials(u.name)}</div>${u.name}</div></td>
      <td>${u.email}</td>
      <td><span class="role-badge ${u.role}">${u.role}</span></td>
      <td>${formatDate(u.created_at)}</td>
      <td>${u.last_login ? timeAgo(u.last_login) : 'Never'}</td>
      <td><span class="status-chip ${u.is_active ? 'submitted' : 'absent'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-outline" style="padding:4px 8px;font-size:0.75rem" onclick="toggleUser('${u.id}')">
          ${u.is_active ? 'Deactivate' : 'Activate'}
        </button>
        ${u.id !== currentUser.id ? `
          <button class="btn btn-danger" style="padding:4px 8px;font-size:0.75rem;margin-left:4px" onclick="deleteUser('${u.id}')">Delete</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

function filterUsers() {
  const q = document.getElementById('user-search').value.toLowerCase();
  const filtered = window._adminUsers?.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) || [];
  renderUsersTable(filtered);
}

async function toggleUser(id) {
  try {
    await api(`/api/admin/users/${id}/toggle`, { method: 'PUT' });
    showToast('User updated', 'success');
    loadAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('Permanently delete this user?')) return;
  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    showToast('User deleted', 'success');
    loadAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`admin-tab-${tab}`).classList.add('active');
  document.querySelector(`.admin-tabs .tab-btn[data-tab="${tab}"]`)?.classList.add('active');
}

// ===========================
// Profile
// ===========================
async function loadProfile() {
  try {
    const user = await api('/api/auth/me');
    document.getElementById('profile-avatar-large').textContent = getInitials(user.name);
    document.getElementById('profile-name-display').textContent = user.name;
    document.getElementById('profile-role-badge').textContent = user.role;
    document.getElementById('profile-role-badge').className = `role-badge ${user.role}`;
    document.getElementById('profile-name').value = user.name;
    document.getElementById('profile-email').value = user.email;
    document.getElementById('profile-phone').value = user.phone || '';

    // Stats
    const classes = await api('/api/classes');
    document.getElementById('profile-stats').innerHTML = `
      <div class="profile-stat"><h4>${classes.length}</h4><p>Classes</p></div>
      <div class="profile-stat"><h4>${new Date(user.created_at).toLocaleDateString()}</h4><p>Joined</p></div>
    `;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;

  try {
    await api('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ name, phone, ...(currentPassword && newPassword ? { currentPassword, newPassword } : {}) })
    });
    showToast('Profile updated!', 'success');
    currentUser.name = name;
    document.getElementById('sidebar-name').textContent = name;
    document.getElementById('sidebar-avatar').textContent = getInitials(name);
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===========================
// Global Search
// ===========================
document.getElementById('global-search').addEventListener('input', async (e) => {
  const q = e.target.value.toLowerCase();
  if (q.length < 2) return;
  // Simple: filter current visible items
});

// ===========================
// Init on Page Load
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (token) {
    initApp();
  }
  // Press Enter to login
  document.getElementById('login-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
});
