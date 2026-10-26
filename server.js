const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sms_secret_key_2024_secure';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Auth middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const roleMiddleware = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'student', phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, email, hashed, role, phone || null);
    const token = jwt.sign({ id, name, email, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, name, email, role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, phone, avatar, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, currentPassword, newPassword } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (currentPassword && newPassword) {
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
      const hashed = await bcrypt.hash(newPassword, 10);
      db.prepare('UPDATE users SET name = ?, phone = ?, password = ? WHERE id = ?').run(name || user.name, phone || user.phone, hashed, user.id);
    } else {
      db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name || user.name, phone || user.phone, user.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CLASSES ROUTES ====================
app.get('/api/classes', authMiddleware, (req, res) => {
  let classes;
  if (req.user.role === 'teacher' || req.user.role === 'admin') {
    classes = db.prepare(`
      SELECT c.*, u.name as teacher_name,
        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active') as student_count
      FROM classes c JOIN users u ON c.teacher_id = u.id
      WHERE c.teacher_id = ? AND c.is_archived = 0
    `).all(req.user.id);
    if (req.user.role === 'admin') {
      classes = db.prepare(`
        SELECT c.*, u.name as teacher_name,
          (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active') as student_count
        FROM classes c JOIN users u ON c.teacher_id = u.id WHERE c.is_archived = 0
      `).all();
    }
  } else {
    classes = db.prepare(`
      SELECT c.*, u.name as teacher_name,
        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active') as student_count
      FROM classes c JOIN users u ON c.teacher_id = u.id
      JOIN enrollments en ON en.class_id = c.id
      WHERE en.student_id = ? AND en.status = 'active' AND c.is_archived = 0
    `).all(req.user.id);
  }
  res.json(classes);
});

app.post('/api/classes', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  try {
    const { name, section, subject, description, cover_color } = req.body;
    if (!name) return res.status(400).json({ error: 'Class name required' });
    const id = uuidv4();
    const class_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    db.prepare('INSERT INTO classes (id, name, section, subject, description, teacher_id, class_code, cover_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, section, subject, description, req.user.id, class_code, cover_color || '#1a73e8');
    res.json({ id, class_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/classes/:id', authMiddleware, (req, res) => {
  const cls = db.prepare(`
    SELECT c.*, u.name as teacher_name, u.email as teacher_email
    FROM classes c JOIN users u ON c.teacher_id = u.id WHERE c.id = ?
  `).get(req.params.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  res.json(cls);
});

app.put('/api/classes/:id', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  const { name, section, subject, description, cover_color } = req.body;
  db.prepare('UPDATE classes SET name = ?, section = ?, subject = ?, description = ?, cover_color = ? WHERE id = ?')
    .run(name, section, subject, description, cover_color, req.params.id);
  res.json({ success: true });
});

app.delete('/api/classes/:id', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  db.prepare('UPDATE classes SET is_archived = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/classes/join', authMiddleware, roleMiddleware('student'), (req, res) => {
  try {
    const { class_code } = req.body;
    const cls = db.prepare('SELECT * FROM classes WHERE class_code = ? AND is_archived = 0').get(class_code);
    if (!cls) return res.status(404).json({ error: 'Invalid class code' });
    const existing = db.prepare('SELECT * FROM enrollments WHERE class_id = ? AND student_id = ?').get(cls.id, req.user.id);
    if (existing) return res.status(400).json({ error: 'Already enrolled' });
    const id = uuidv4();
    db.prepare('INSERT INTO enrollments (id, class_id, student_id) VALUES (?, ?, ?)').run(id, cls.id, req.user.id);
    // Notify teacher
    const notifId = uuidv4();
    db.prepare('INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?, ?)').run(
      notifId, cls.teacher_id, 'New Student Joined', `${req.user.name} joined ${cls.name}`, 'info', `/class/${cls.id}`
    );
    res.json({ success: true, class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/classes/:id/students', authMiddleware, (req, res) => {
  const students = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.avatar, e.enrolled_at, e.status
    FROM users u JOIN enrollments e ON e.student_id = u.id
    WHERE e.class_id = ? AND e.status = 'active'
    ORDER BY u.name
  `).all(req.params.id);
  res.json(students);
});

app.delete('/api/classes/:id/students/:studentId', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  db.prepare('UPDATE enrollments SET status = ? WHERE class_id = ? AND student_id = ?').run('removed', req.params.id, req.params.studentId);
  res.json({ success: true });
});

// ==================== ASSIGNMENTS ROUTES ====================
app.get('/api/classes/:classId/assignments', authMiddleware, (req, res) => {
  const assignments = db.prepare(`
    SELECT a.*, u.name as author_name
    FROM assignments a JOIN users u ON a.created_by = u.id
    WHERE a.class_id = ? AND a.is_published = 1
    ORDER BY a.created_at DESC
  `).all(req.params.classId);
  res.json(assignments);
});

app.post('/api/classes/:classId/assignments', authMiddleware, roleMiddleware('teacher', 'admin'), upload.single('attachment'), (req, res) => {
  try {
    const { title, description, due_date, max_points, type } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const id = uuidv4();
    const attachment = req.file ? `/uploads/${req.file.filename}` : null;
    db.prepare('INSERT INTO assignments (id, class_id, title, description, due_date, max_points, created_by, type, attachment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.params.classId, title, description, due_date || null, max_points || 100, req.user.id, type || 'assignment', attachment);
    // Notify students
    const students = db.prepare("SELECT student_id FROM enrollments WHERE class_id = ? AND status = 'active'").all(req.params.classId);
    const cls = db.prepare('SELECT name FROM classes WHERE id = ?').get(req.params.classId);
    students.forEach(s => {
      db.prepare('INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?, ?)').run(
        uuidv4(), s.student_id, 'New Assignment', `New ${type || 'assignment'}: ${title} in ${cls?.name}`, 'assignment', `/class/${req.params.classId}`
      );
    });
    res.json({ id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assignments/:id', authMiddleware, (req, res) => {
  const assignment = db.prepare(`
    SELECT a.*, u.name as author_name, c.name as class_name
    FROM assignments a JOIN users u ON a.created_by = u.id JOIN classes c ON a.class_id = c.id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Not found' });
  res.json(assignment);
});

app.put('/api/assignments/:id', authMiddleware, roleMiddleware('teacher', 'admin'), upload.single('attachment'), (req, res) => {
  const { title, description, due_date, max_points } = req.body;
  const attachment = req.file ? `/uploads/${req.file.filename}` : undefined;
  if (attachment) {
    db.prepare('UPDATE assignments SET title=?, description=?, due_date=?, max_points=?, attachment=? WHERE id=?').run(title, description, due_date, max_points, attachment, req.params.id);
  } else {
    db.prepare('UPDATE assignments SET title=?, description=?, due_date=?, max_points=? WHERE id=?').run(title, description, due_date, max_points, req.params.id);
  }
  res.json({ success: true });
});

app.delete('/api/assignments/:id', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  db.prepare('UPDATE assignments SET is_published = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== SUBMISSIONS ROUTES ====================
app.post('/api/assignments/:id/submit', authMiddleware, roleMiddleware('student'), upload.single('attachment'), (req, res) => {
  try {
    const { content } = req.body;
    const attachment = req.file ? `/uploads/${req.file.filename}` : null;
    const existing = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?').get(req.params.id, req.user.id);
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    const isLate = assignment.due_date && new Date() > new Date(assignment.due_date);
    if (existing) {
      db.prepare('UPDATE submissions SET content=?, attachment=?, submitted_at=CURRENT_TIMESTAMP, status=? WHERE id=?').run(content, attachment || existing.attachment, isLate ? 'late' : 'submitted', existing.id);
      return res.json({ success: true, id: existing.id });
    }
    const id = uuidv4();
    db.prepare('INSERT INTO submissions (id, assignment_id, student_id, content, attachment, status) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.params.id, req.user.id, content, attachment, isLate ? 'late' : 'submitted');
    // Notify teacher
    const cls = db.prepare('SELECT c.teacher_id, c.name FROM classes c JOIN assignments a ON a.class_id = c.id WHERE a.id = ?').get(req.params.id);
    if (cls) {
      db.prepare('INSERT INTO notifications (id, user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?, ?)').run(
        uuidv4(), cls.teacher_id, 'New Submission', `${req.user.name} submitted ${assignment.title}`, 'submission', `/assignment/${req.params.id}/submissions`
      );
    }
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assignments/:id/submissions', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  const submissions = db.prepare(`
    SELECT s.*, u.name as student_name, u.email as student_email
    FROM submissions s JOIN users u ON s.student_id = u.id
    WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC
  `).all(req.params.id);
  res.json(submissions);
});

app.get('/api/assignments/:id/my-submission', authMiddleware, (req, res) => {
  const sub = db.prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?').get(req.params.id, req.user.id);
  res.json(sub || null);
});

app.put('/api/submissions/:id/grade', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  try {
    const { grade, feedback } = req.body;
    const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    db.prepare('UPDATE submissions SET grade=?, feedback=?, graded_at=CURRENT_TIMESTAMP, status=? WHERE id=?').run(grade, feedback, 'graded', req.params.id);
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(sub.assignment_id);
    // Update grade record
    const existing = db.prepare('SELECT id FROM grade_records WHERE student_id = ? AND assignment_id = ?').get(sub.student_id, sub.assignment_id);
    if (existing) {
      db.prepare('UPDATE grade_records SET points_earned=?, recorded_at=CURRENT_TIMESTAMP WHERE id=?').run(grade, existing.id);
    } else {
      db.prepare('INSERT INTO grade_records (id, student_id, class_id, assignment_id, points_earned, points_possible) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), sub.student_id, assignment.class_id, sub.assignment_id, grade, assignment.max_points);
    }
    // Notify student
    db.prepare('INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), sub.student_id, 'Assignment Graded', `Your submission for "${assignment.title}" has been graded: ${grade}/${assignment.max_points}`, 'grade');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ANNOUNCEMENTS ROUTES ====================
app.get('/api/classes/:classId/announcements', authMiddleware, (req, res) => {
  const posts = db.prepare(`
    SELECT a.*, u.name as author_name, u.role as author_role,
      (SELECT COUNT(*) FROM comments c WHERE c.announcement_id = a.id) as comment_count
    FROM announcements a JOIN users u ON a.author_id = u.id
    WHERE a.class_id = ? ORDER BY a.created_at DESC
  `).all(req.params.classId);
  res.json(posts);
});

app.post('/api/classes/:classId/announcements', authMiddleware, upload.single('attachment'), (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const attachment = req.file ? `/uploads/${req.file.filename}` : null;
    const id = uuidv4();
    db.prepare('INSERT INTO announcements (id, class_id, author_id, content, attachment) VALUES (?, ?, ?, ?, ?)').run(id, req.params.classId, req.user.id, content, attachment);
    res.json({ id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/announcements/:id', authMiddleware, (req, res) => {
  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(req.params.id);
  if (!ann) return res.status(404).json({ error: 'Not found' });
  if (ann.author_id !== req.user.id && req.user.role === 'student') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/announcements/:id/comments', authMiddleware, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.name as author_name, u.role as author_role
    FROM comments c JOIN users u ON c.author_id = u.id
    WHERE c.announcement_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(comments);
});

app.post('/api/announcements/:id/comments', authMiddleware, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  const id = uuidv4();
  db.prepare('INSERT INTO comments (id, announcement_id, author_id, content) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.user.id, content);
  res.json({ id, success: true });
});

// ==================== ATTENDANCE ROUTES ====================
app.get('/api/classes/:classId/attendance', authMiddleware, (req, res) => {
  const { date } = req.query;
  let records;
  if (date) {
    records = db.prepare(`
      SELECT a.*, u.name as student_name, u.email as student_email
      FROM attendance a JOIN users u ON a.student_id = u.id
      WHERE a.class_id = ? AND a.date = ?
    `).all(req.params.classId, date);
  } else {
    records = db.prepare(`
      SELECT a.*, u.name as student_name
      FROM attendance a JOIN users u ON a.student_id = u.id
      WHERE a.class_id = ? ORDER BY a.date DESC LIMIT 100
    `).all(req.params.classId);
  }
  res.json(records);
});

app.post('/api/classes/:classId/attendance', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  try {
    const { records, date } = req.body; // records: [{student_id, status, notes}]
    const stmt = db.prepare('INSERT OR REPLACE INTO attendance (id, class_id, student_id, date, status, marked_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((records) => {
      for (const r of records) {
        stmt.run(uuidv4(), req.params.classId, r.student_id, date, r.status || 'present', req.user.id, r.notes || null);
      }
    });
    insertMany(records);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/classes/:classId/attendance/summary', authMiddleware, (req, res) => {
  const summary = db.prepare(`
    SELECT u.id, u.name,
      COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present,
      COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent,
      COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late,
      COUNT(CASE WHEN a.status = 'excused' THEN 1 END) as excused,
      COUNT(*) as total
    FROM users u
    JOIN enrollments e ON e.student_id = u.id AND e.class_id = ?
    LEFT JOIN attendance a ON a.student_id = u.id AND a.class_id = ?
    WHERE e.status = 'active'
    GROUP BY u.id, u.name
  `).all(req.params.classId, req.params.classId);
  res.json(summary);
});

// ==================== GRADES ROUTES ====================
app.get('/api/classes/:classId/grades', authMiddleware, (req, res) => {
  if (req.user.role === 'student') {
    const grades = db.prepare(`
      SELECT a.title, a.max_points, a.due_date, s.grade, s.feedback, s.status, s.submitted_at
      FROM assignments a
      LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
      WHERE a.class_id = ? AND a.is_published = 1
      ORDER BY a.created_at DESC
    `).all(req.user.id, req.params.classId);
    res.json(grades);
  } else {
    const grades = db.prepare(`
      SELECT u.id, u.name,
        AVG(CASE WHEN s.grade IS NOT NULL THEN (s.grade * 100.0 / a.max_points) END) as avg_percent,
        COUNT(DISTINCT s.id) as submitted,
        COUNT(DISTINCT CASE WHEN s.grade IS NOT NULL THEN s.id END) as graded
      FROM users u
      JOIN enrollments e ON e.student_id = u.id AND e.class_id = ?
      LEFT JOIN submissions s ON s.student_id = u.id
      LEFT JOIN assignments a ON a.id = s.assignment_id AND a.class_id = ?
      WHERE e.status = 'active'
      GROUP BY u.id, u.name ORDER BY u.name
    `).all(req.params.classId, req.params.classId);
    res.json(grades);
  }
});

// ==================== NOTIFICATIONS ====================
app.get('/api/notifications', authMiddleware, (req, res) => {
  const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json(notifs);
});

app.put('/api/notifications/read-all', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

app.put('/api/notifications/:id/read', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ==================== EVENTS / CALENDAR ====================
app.get('/api/events', authMiddleware, (req, res) => {
  const events = db.prepare(`
    SELECT e.*, u.name as creator_name, c.name as class_name
    FROM events e JOIN users u ON e.created_by = u.id
    LEFT JOIN classes c ON e.class_id = c.id
    ORDER BY e.start_date ASC
  `).all();
  res.json(events);
});

app.post('/api/events', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  const { title, description, start_date, end_date, class_id, type } = req.body;
  if (!title || !start_date) return res.status(400).json({ error: 'Title and start date required' });
  const id = uuidv4();
  db.prepare('INSERT INTO events (id, title, description, start_date, end_date, class_id, created_by, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, title, description, start_date, end_date, class_id || null, req.user.id, type || 'event');
  res.json({ id, success: true });
});

app.delete('/api/events/:id', authMiddleware, roleMiddleware('teacher', 'admin'), (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== MESSAGES ====================
app.get('/api/messages/:userId', authMiddleware, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, u.name as sender_name
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.sent_at ASC
  `).all(req.user.id, req.params.userId, req.params.userId, req.user.id);
  db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?').run(req.params.userId, req.user.id);
  res.json(messages);
});

app.post('/api/messages', authMiddleware, (req, res) => {
  const { receiver_id, content } = req.body;
  if (!receiver_id || !content) return res.status(400).json({ error: 'Receiver and content required' });
  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)').run(id, req.user.id, receiver_id, content);
  res.json({ id, success: true });
});

app.get('/api/messages/conversations/list', authMiddleware, (req, res) => {
  const convs = db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.role,
      (SELECT content FROM messages WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id) ORDER BY sent_at DESC LIMIT 1) as last_message,
      (SELECT sent_at FROM messages WHERE (sender_id = u.id AND receiver_id = ?) OR (sender_id = ? AND receiver_id = u.id) ORDER BY sent_at DESC LIMIT 1) as last_time,
      (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) as unread
    FROM users u
    WHERE u.id IN (
      SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END FROM messages WHERE sender_id = ? OR receiver_id = ?
    ) AND u.id != ?
    ORDER BY last_time DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(convs);
});

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/stats', authMiddleware, roleMiddleware('admin'), (req, res) => {
  const stats = {
    total_students: db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student' AND is_active = 1").get().c,
    total_teachers: db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'teacher' AND is_active = 1").get().c,
    total_classes: db.prepare("SELECT COUNT(*) as c FROM classes WHERE is_archived = 0").get().c,
    total_assignments: db.prepare("SELECT COUNT(*) as c FROM assignments WHERE is_published = 1").get().c,
    total_submissions: db.prepare("SELECT COUNT(*) as c FROM submissions").get().c,
    recent_users: db.prepare("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5").all(),
  };
  res.json(stats);
});

app.get('/api/admin/users', authMiddleware, roleMiddleware('admin'), (req, res) => {
  const users = db.prepare("SELECT id, name, email, role, phone, created_at, last_login, is_active FROM users ORDER BY created_at DESC").all();
  res.json(users);
});

app.put('/api/admin/users/:id/toggle', authMiddleware, roleMiddleware('admin'), (req, res) => {
  const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(user.is_active ? 0 : 1, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', authMiddleware, roleMiddleware('admin'), (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// People (users list for messaging)
app.get('/api/people', authMiddleware, (req, res) => {
  const people = db.prepare("SELECT id, name, email, role FROM users WHERE id != ? AND is_active = 1 ORDER BY name").all(req.user.id);
  res.json(people);
});

// Catch-all: serve index.html
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create default admin
const initAdmin = () => {
  const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@sms.com'").get();
  if (!admin) {
    const hashed = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)").run(uuidv4(), 'Administrator', 'admin@sms.com', hashed, 'admin');
    console.log('Default admin created: admin@sms.com / admin123');
  }
};
initAdmin();

app.listen(PORT, () => {
  console.log(`\n🎓 Student Management System running at http://localhost:${PORT}`);
  console.log(`📧 Default Admin: admin@sms.com | Password: admin123\n`);
});
