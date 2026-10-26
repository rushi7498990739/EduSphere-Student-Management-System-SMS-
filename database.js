const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'sms.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create all tables
db.exec(`
  -- Users table (students, teachers, admins)
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
    avatar TEXT DEFAULT NULL,
    phone TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT NULL,
    is_active INTEGER DEFAULT 1
  );

  -- Classes table
  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    section TEXT,
    subject TEXT,
    description TEXT,
    teacher_id TEXT NOT NULL,
    class_code TEXT UNIQUE NOT NULL,
    cover_color TEXT DEFAULT '#1a73e8',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived INTEGER DEFAULT 0,
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  );

  -- Class enrollments
  CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    UNIQUE(class_id, student_id)
  );

  -- Assignments table
  CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATETIME,
    max_points INTEGER DEFAULT 100,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT DEFAULT 'assignment' CHECK(type IN ('assignment', 'quiz', 'material', 'question')),
    attachment TEXT DEFAULT NULL,
    is_published INTEGER DEFAULT 1,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Submissions table
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    content TEXT,
    attachment TEXT DEFAULT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    grade INTEGER DEFAULT NULL,
    feedback TEXT DEFAULT NULL,
    graded_at DATETIME DEFAULT NULL,
    status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'graded', 'returned', 'late')),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    UNIQUE(assignment_id, student_id)
  );

  -- Announcements (Stream posts)
  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    attachment TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  -- Comments on announcements
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    announcement_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (announcement_id) REFERENCES announcements(id),
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  -- Attendance table
  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT DEFAULT 'present' CHECK(status IN ('present', 'absent', 'late', 'excused')),
    marked_by TEXT NOT NULL,
    notes TEXT DEFAULT NULL,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (marked_by) REFERENCES users(id),
    UNIQUE(class_id, student_id, date)
  );

  -- Notifications table
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    link TEXT DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Messages (Direct messaging)
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    content TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  -- Grades summary view helper
  CREATE TABLE IF NOT EXISTS grade_records (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    assignment_id TEXT NOT NULL,
    points_earned INTEGER,
    points_possible INTEGER,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id)
  );

  -- Events / Calendar
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATETIME NOT NULL,
    end_date DATETIME,
    class_id TEXT DEFAULT NULL,
    created_by TEXT NOT NULL,
    type TEXT DEFAULT 'event' CHECK(type IN ('event', 'deadline', 'holiday', 'exam')),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
`);

module.exports = db;
