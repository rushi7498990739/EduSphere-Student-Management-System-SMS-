// seed.js - Creates demo data for testing
const db = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

console.log('🌱 Seeding demo data...');

// Create demo teacher
const teacherExists = db.prepare("SELECT id FROM users WHERE email = 'teacher@sms.com'").get();
let teacherId;
if (!teacherExists) {
  teacherId = uuidv4();
  const hash = bcrypt.hashSync('teacher123', 10);
  db.prepare("INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)").run(teacherId, 'Prof. John Smith', 'teacher@sms.com', hash, 'teacher', '+91-9876543210');
  console.log('✅ Teacher created: teacher@sms.com / teacher123');
} else {
  teacherId = teacherExists.id;
}

// Create demo students
const students = [
  { name: 'Alice Johnson', email: 'student@sms.com', phone: '+91-9876543211' },
  { name: 'Bob Wilson', email: 'bob@sms.com', phone: '+91-9876543212' },
  { name: 'Carol Davis', email: 'carol@sms.com', phone: '+91-9876543213' },
];

const studentIds = [];
students.forEach(s => {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(s.email);
  if (!exists) {
    const id = uuidv4();
    const hash = bcrypt.hashSync('student123', 10);
    db.prepare("INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)").run(id, s.name, s.email, hash, 'student', s.phone);
    studentIds.push(id);
    console.log(`✅ Student: ${s.email} / student123`);
  } else {
    studentIds.push(exists.id);
  }
});

// Create demo classes
const classesData = [
  { name: 'Mathematics 101', section: 'Section A', subject: 'Algebra', cover_color: '#1a73e8', description: 'Introduction to algebra and calculus' },
  { name: 'Science Class', section: 'Section B', subject: 'Physics', cover_color: '#34a853', description: 'Explore the fundamentals of physics' },
  { name: 'English Literature', section: 'Section C', subject: 'Literature', cover_color: '#ea4335', description: 'Classic and modern literature' },
];

const classIds = [];
classesData.forEach(c => {
  const exists = db.prepare('SELECT id FROM classes WHERE name = ? AND teacher_id = ?').get(c.name, teacherId);
  if (!exists) {
    const id = uuidv4();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    db.prepare('INSERT INTO classes (id, name, section, subject, description, teacher_id, class_code, cover_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, c.name, c.section, c.subject, c.description, teacherId, code, c.cover_color);
    classIds.push(id);
    console.log(`✅ Class: ${c.name} (Code: ${code})`);
  } else {
    classIds.push(exists.id);
  }
});

// Enroll all students in all classes
classIds.forEach(classId => {
  studentIds.forEach(studentId => {
    const exists = db.prepare('SELECT id FROM enrollments WHERE class_id = ? AND student_id = ?').get(classId, studentId);
    if (!exists) {
      db.prepare('INSERT INTO enrollments (id, class_id, student_id) VALUES (?, ?, ?)').run(uuidv4(), classId, studentId);
    }
  });
});

// Create sample assignments
classIds.forEach((classId, idx) => {
  const assignmentTitles = [
    ['Chapter 1 Exercise', 'Midterm Exam', 'Final Project'],
    ['Lab Report 1', 'Physics Quiz', 'Science Fair Project'],
    ['Essay: Shakespeare', 'Poetry Analysis', 'Book Review'],
  ];

  assignmentTitles[idx].forEach((title, i) => {
    const exists = db.prepare('SELECT id FROM assignments WHERE title = ? AND class_id = ?').get(title, classId);
    if (!exists) {
      const due = new Date();
      due.setDate(due.getDate() + (i + 1) * 7);
      db.prepare('INSERT INTO assignments (id, class_id, title, description, due_date, max_points, created_by, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        uuidv4(), classId, title, `Complete ${title} as instructed in class. Submit before the due date.`, due.toISOString(), i === 1 ? 50 : 100, teacherId, i === 1 ? 'quiz' : 'assignment'
      );
    }
  });
});

// Add sample announcements
classIds.slice(0, 2).forEach((classId, idx) => {
  const msgs = [
    'Welcome to the class! Please review the syllabus and be ready for an exciting semester.',
    'Reminder: Assignment 1 is due next week. Reach out if you have any questions.',
  ];
  msgs.forEach(content => {
    const exists = db.prepare('SELECT id FROM announcements WHERE content = ? AND class_id = ?').get(content, classId);
    if (!exists) {
      db.prepare('INSERT INTO announcements (id, class_id, author_id, content) VALUES (?, ?, ?, ?)').run(uuidv4(), classId, teacherId, content);
    }
  });
});

// Add sample events
const eventsData = [
  { title: 'Semester Start', type: 'event', start: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString() },
  { title: 'Mid-term Exams', type: 'exam', start: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString() },
  { title: 'Diwali Holiday', type: 'holiday', start: new Date(new Date().setDate(new Date().getDate() + 15)).toISOString() },
  { title: 'Project Deadline', type: 'deadline', start: new Date(new Date().setDate(new Date().getDate() + 21)).toISOString() },
];

const adminId = db.prepare("SELECT id FROM users WHERE email = 'admin@sms.com'").get()?.id;
if (adminId) {
  eventsData.forEach(e => {
    const exists = db.prepare('SELECT id FROM events WHERE title = ?').get(e.title);
    if (!exists) {
      db.prepare('INSERT INTO events (id, title, type, start_date, created_by) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), e.title, e.type, e.start, adminId);
    }
  });
}

console.log('\n✅ Demo data seeded successfully!');
console.log('\n📋 Demo Accounts:');
console.log('   Admin:   admin@sms.com   / admin123');
console.log('   Teacher: teacher@sms.com / teacher123');
console.log('   Student: student@sms.com / student123\n');
