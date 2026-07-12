const bcrypt = require('bcrypt');
const { query } = require('../../config/database');
const { generateToken } = require('../../utils/jwt');

const SALT_ROUNDS = 10;

// ── Public: Register ──────────────────────────────────────────────────────────
const teacherRegister = async ({ full_name, phone, email, teacher_category, cadre_name, current_posting, address, password }) => {
  if (!full_name?.trim()) throw { statusCode: 400, message: 'নাম দিন' };
  if (!phone?.trim())     throw { statusCode: 400, message: 'ফোন নম্বর দিন' };
  if (!password || password.length < 4) throw { statusCode: 400, message: 'পিন কমপক্ষে ৪ সংখ্যার হতে হবে' };

  const existing = await query(`SELECT id FROM academy_teachers WHERE phone=$1`, [phone]);
  if (existing.rows.length) throw { statusCode: 409, message: 'এই ফোন নম্বরে ইতোমধ্যে একটি অ্যাকাউন্ট আছে' };

  const countR  = await query(`SELECT COUNT(*) FROM academy_teachers`);
  const num     = String(parseInt(countR.rows[0].count) + 1).padStart(4, '0');
  const teacher_code = `TCH-${num}`;
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const cat = teacher_category || 'non_cadre';

  const r = await query(
    `INSERT INTO academy_teachers
       (teacher_code, full_name, phone, email, teacher_category, cadre_name, current_posting, address, password_hash, approval_status, teacher_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','junior')
     RETURNING id, teacher_code, full_name, phone, approval_status`,
    [teacher_code, full_name.trim(), phone.trim(), email || null, cat, cadre_name || null, current_posting || null, address || null, password_hash]
  );
  return r.rows[0];
};

// ── Public: Login ─────────────────────────────────────────────────────────────
const teacherLogin = async ({ phone, password }) => {
  if (!phone || !password) throw { statusCode: 400, message: 'ফোন ও পাসওয়ার্ড দিন' };

  const r = await query(
    `SELECT id, teacher_code, full_name, phone, email, password_hash,
            approval_status, teacher_type, teacher_category, specialization, fixed_rate
     FROM academy_teachers WHERE phone=$1`,
    [phone]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'এই নম্বরে কোনো অ্যাকাউন্ট নেই' };

  const teacher = r.rows[0];

  if (!teacher.password_hash) throw { statusCode: 401, message: 'পাসওয়ার্ড সেট করা নেই — admin এর সাথে যোগাযোগ করুন' };

  const match = await bcrypt.compare(password, teacher.password_hash);
  if (!match) throw { statusCode: 401, message: 'পাসওয়ার্ড ভুল' };

  if (teacher.approval_status === 'pending')  throw { statusCode: 403, message: 'আপনার অ্যাকাউন্ট এখনও অনুমোদনের অপেক্ষায় আছে' };
  if (teacher.approval_status === 'rejected') throw { statusCode: 403, message: 'আপনার অ্যাকাউন্ট অনুমোদিত হয়নি' };

  await query(`UPDATE academy_teachers SET last_login=NOW() WHERE id=$1`, [teacher.id]);

  const token = generateToken({ teacherId: teacher.id, role: 'teacher' });

  return {
    token,
    teacher: {
      id: teacher.id,
      teacher_code: teacher.teacher_code,
      full_name: teacher.full_name,
      phone: teacher.phone,
      email: teacher.email,
      teacher_type: teacher.teacher_type,
      teacher_category: teacher.teacher_category,
      specialization: teacher.specialization,
    },
  };
};

// ── Teacher: My classes ───────────────────────────────────────────────────────
const getMyClasses = async (teacherId) => {
  const r = await query(
    `SELECT bo.id, bo.row_type, bo.class_no, bo.scheduled_date, bo.scheduled_time,
            bo.topic, bo.status, bo.class_type, bo.zoom_link,
            b.batch_name, b.id as batch_id,
            c.course_name,
            za.account_name as zoom_account_name
     FROM academy_batch_outline bo
     JOIN academy_batches b ON b.id = bo.batch_id
     JOIN academy_courses c ON c.id = b.course_id
     LEFT JOIN academy_zoom_accounts za ON za.id = bo.zoom_account_id
     WHERE bo.teacher_id=$1
     ORDER BY bo.scheduled_date DESC, bo.scheduled_time`,
    [teacherId]
  );
  return r.rows;
};

// ── Teacher: My payments ──────────────────────────────────────────────────────
const getMyPayments = async (teacherId) => {
  const r = await query(
    `SELECT tp.*, b.batch_name
     FROM academy_teacher_payments tp
     LEFT JOIN academy_batches b ON b.id = tp.batch_id
     WHERE tp.teacher_id=$1
     ORDER BY tp.created_at DESC`,
    [teacherId]
  );
  return r.rows;
};

// ── Teacher: Get profile ──────────────────────────────────────────────────────
const getMyProfile = async (teacherId) => {
  const r = await query(
    `SELECT id, teacher_code, full_name, phone, email, teacher_type, teacher_category,
            specialization, bio, zoom_display_name, last_login
     FROM academy_teachers WHERE id=$1`,
    [teacherId]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};

// ── Admin: Approve / Reject ───────────────────────────────────────────────────
const approveTeacher = async (id, adminUserId, approved) => {
  const status = approved ? 'approved' : 'rejected';
  const r = await query(
    `UPDATE academy_teachers
     SET approval_status=$1, approved_by=$2, approved_at=NOW(), updated_at=NOW()
     WHERE id=$3 RETURNING id, teacher_code, full_name, approval_status`,
    [status, adminUserId, id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};

// ── Admin: Reset password ─────────────────────────────────────────────────────
const resetTeacherPassword = async (id, newPassword) => {
  if (!newPassword || newPassword.length < 6) throw { statusCode: 400, message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে' };
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const r = await query(
    `UPDATE academy_teachers SET password_hash=$1, updated_at=NOW() WHERE id=$2 RETURNING id, full_name`,
    [hash, id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return { success: true, message: 'পাসওয়ার্ড রিসেট হয়েছে' };
};

// ── Admin: Pending teachers ───────────────────────────────────────────────────
const getPendingTeachers = async () => {
  const r = await query(
    `SELECT id, teacher_code, full_name, phone, email, teacher_category, cadre_name, current_posting, address, created_at
     FROM academy_teachers WHERE approval_status='pending' ORDER BY created_at`,
  );
  return r.rows;
};

module.exports = {
  teacherRegister, teacherLogin,
  getMyClasses, getMyPayments, getMyProfile,
  approveTeacher, resetTeacherPassword, getPendingTeachers,
};
