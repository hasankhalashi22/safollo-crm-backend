const { query } = require('../../config/database');

// ── Zoom Accounts ─────────────────────────────────────────────────────────────
const getZoomAccounts = async () => {
  const r = await query(`SELECT * FROM academy_zoom_accounts ORDER BY account_name`);
  return r.rows;
};
const createZoomAccount = async ({ account_name, email, host_key, zoom_user_id, notes }) => {
  const r = await query(
    `INSERT INTO academy_zoom_accounts (account_name, email, host_key, zoom_user_id, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [account_name, email, host_key || null, zoom_user_id || null, notes || null]
  );
  return r.rows[0];
};
const updateZoomAccount = async (id, { account_name, email, host_key, zoom_user_id, notes, is_active }) => {
  const r = await query(
    `UPDATE academy_zoom_accounts SET account_name=$1, email=$2, host_key=$3, zoom_user_id=$4,
     notes=$5, is_active=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
    [account_name, email, host_key || null, zoom_user_id || null, notes || null, is_active ?? true, id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const deleteZoomAccount = async (id) => {
  await query(`DELETE FROM academy_zoom_accounts WHERE id=$1`, [id]);
  return { deleted: true };
};

// ── Payment Rates ─────────────────────────────────────────────────────────────
const getPaymentRates = async () => {
  const r = await query(`SELECT * FROM academy_payment_rates ORDER BY teacher_type, class_type`);
  return r.rows;
};
const upsertPaymentRate = async ({ teacher_type, class_type, rate_per_class }) => {
  const r = await query(
    `INSERT INTO academy_payment_rates (teacher_type, class_type, rate_per_class)
     VALUES ($1,$2,$3)
     ON CONFLICT (teacher_type, class_type) DO UPDATE SET rate_per_class=$3, updated_at=NOW()
     RETURNING *`,
    [teacher_type, class_type, rate_per_class]
  );
  return r.rows[0];
};
const deletePaymentRate = async (id) => {
  await query(`DELETE FROM academy_payment_rates WHERE id=$1`, [id]);
  return { deleted: true };
};

// ── Teachers ──────────────────────────────────────────────────────────────────
const getTeachers = async () => {
  const r = await query(
    `SELECT t.*,
       COALESCE(SUM(CASE WHEN p.status='pending' THEN p.amount ELSE 0 END), 0) AS total_due,
       COALESCE(SUM(CASE WHEN p.status='paid'    THEN p.amount ELSE 0 END), 0) AS total_paid,
       COUNT(DISTINCT CASE WHEN p.status='pending' THEN p.id END) AS pending_count
     FROM academy_teachers t
     LEFT JOIN academy_teacher_payments p ON p.teacher_id = t.id
     GROUP BY t.id
     ORDER BY t.full_name`
  );
  return r.rows;
};
const getTeacher = async (id) => {
  const r = await query(`SELECT * FROM academy_teachers WHERE id=$1`, [id]);
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const createTeacher = async (data) => {
  const { full_name, teacher_type, phone, email, specialization, bio, zoom_display_name } = data;
  const countR = await query(`SELECT COUNT(*) FROM academy_teachers`);
  const num = String(parseInt(countR.rows[0].count) + 1).padStart(4, '0');
  const teacher_code = `TCH-${num}`;
  const r = await query(
    `INSERT INTO academy_teachers (teacher_code, full_name, teacher_type, phone, email, specialization, bio, zoom_display_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [teacher_code, full_name, teacher_type || 'junior', phone || null, email || null,
     specialization || null, bio || null, zoom_display_name || null]
  );
  return r.rows[0];
};
const updateTeacher = async (id, data) => {
  const { full_name, teacher_type, phone, email, specialization, bio, zoom_display_name, is_active } = data;
  const r = await query(
    `UPDATE academy_teachers SET full_name=$1, teacher_type=$2, phone=$3, email=$4,
     specialization=$5, bio=$6, zoom_display_name=$7, is_active=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [full_name, teacher_type, phone || null, email || null,
     specialization || null, bio || null, zoom_display_name || null, is_active ?? true, id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const deleteTeacher = async (id) => {
  const check = await query(`SELECT COUNT(*) FROM academy_teacher_payments WHERE teacher_id=$1`, [id]);
  if (parseInt(check.rows[0].count) > 0) throw { statusCode: 400, message: 'এই শিক্ষকের পেমেন্ট রেকর্ড আছে' };
  await query(`DELETE FROM academy_teachers WHERE id=$1`, [id]);
  return { deleted: true };
};
const getTeacherHistory = async (id) => {
  const sessions = await query(
    `SELECT bo.*, b.batch_name, c.course_name,
            cf.status AS feedback_status, cf.submitted_at,
            tp.status AS payment_status, tp.amount AS payment_amount
     FROM academy_batch_outline bo
     JOIN academy_batches b ON b.id = bo.batch_id
     JOIN academy_courses c ON c.id = b.course_id
     LEFT JOIN academy_class_feedback cf ON cf.outline_id = bo.id AND cf.teacher_id = $1
     LEFT JOIN academy_teacher_payments tp ON tp.outline_id = bo.id AND tp.teacher_id = $1
     WHERE bo.teacher_id = $1 AND bo.row_type = 'class'
     ORDER BY bo.scheduled_date DESC NULLS LAST`,
    [id]
  );
  return { sessions: sessions.rows };
};

// ── Courses ───────────────────────────────────────────────────────────────────
const getCourses = async () => {
  const r = await query(
    `SELECT c.*, COUNT(DISTINCT p.id) AS plan_count
     FROM academy_courses c
     LEFT JOIN academy_course_plans p ON p.course_id = c.id
     GROUP BY c.id ORDER BY c.course_name`
  );
  return r.rows;
};
const createCourse = async ({ course_name, description }) => {
  // Auto course_code: CRS-001
  const countR = await query(`SELECT COUNT(*) FROM academy_courses`);
  const num = String(parseInt(countR.rows[0].count) + 1).padStart(3, '0');
  const course_code = `CRS-${num}`;
  const r = await query(
    `INSERT INTO academy_courses (course_code, course_name, description) VALUES ($1,$2,$3) RETURNING *`,
    [course_code, course_name, description || null]
  );
  return r.rows[0];
};
const updateCourse = async (id, { course_name, description, is_active }) => {
  const r = await query(
    `UPDATE academy_courses SET course_name=$1, description=$2, is_active=$3, updated_at=NOW()
     WHERE id=$4 RETURNING *`,
    [course_name, description || null, is_active ?? true, id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const deleteCourse = async (id) => {
  const check = await query(`SELECT COUNT(*) FROM academy_batches WHERE course_id=$1`, [id]);
  if (parseInt(check.rows[0].count) > 0) throw { statusCode: 400, message: 'এই কোর্সে ব্যাচ আছে' };
  await query(`DELETE FROM academy_courses WHERE id=$1`, [id]);
  return { deleted: true };
};

// ── Course Plans ──────────────────────────────────────────────────────────────
const getCoursePlans = async (courseId) => {
  const r = await query(
    `SELECT p.*, COUNT(DISTINCT s.id) AS subject_count
     FROM academy_course_plans p
     LEFT JOIN academy_plan_subjects s ON s.plan_id = p.id
     WHERE p.course_id = $1
     GROUP BY p.id ORDER BY p.version`,
    [courseId]
  );
  return r.rows;
};
const createPlan = async (courseId, { plan_name, total_classes, notes }) => {
  // Auto-version
  const verR = await query(`SELECT COALESCE(MAX(version), 0) AS mx FROM academy_course_plans WHERE course_id=$1`, [courseId]);
  const version = parseInt(verR.rows[0].mx) + 1;
  const r = await query(
    `INSERT INTO academy_course_plans (course_id, plan_name, version, total_classes, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [courseId, plan_name, version, total_classes || 0, notes || null]
  );
  return r.rows[0];
};
const updatePlan = async (id, { plan_name, total_classes, is_active, notes }) => {
  const r = await query(
    `UPDATE academy_course_plans SET plan_name=$1, total_classes=$2, is_active=$3, notes=$4, updated_at=NOW()
     WHERE id=$5 RETURNING *`,
    [plan_name, total_classes || 0, is_active ?? false, notes || null, id]
  );
  return r.rows[0];
};
const deletePlan = async (id) => {
  await query(`DELETE FROM academy_plan_lectures WHERE subject_id IN (SELECT id FROM academy_plan_subjects WHERE plan_id=$1)`, [id]);
  await query(`DELETE FROM academy_plan_subjects WHERE plan_id=$1`, [id]);
  await query(`DELETE FROM academy_course_plans WHERE id=$1`, [id]);
  return { deleted: true };
};

// ── Plan Subjects ─────────────────────────────────────────────────────────────
const getPlanSubjects = async (planId) => {
  const subjects = await query(
    `SELECT ps.*, COUNT(pl.id) AS lecture_count
     FROM academy_plan_subjects ps
     LEFT JOIN academy_plan_lectures pl ON pl.subject_id = ps.id
     WHERE ps.plan_id = $1
     GROUP BY ps.id ORDER BY ps.serial_no`,
    [planId]
  );
  const lecturesR = await query(
    `SELECT pl.* FROM academy_plan_lectures pl
     JOIN academy_plan_subjects ps ON ps.id = pl.subject_id
     WHERE ps.plan_id = $1 ORDER BY pl.serial_no`,
    [planId]
  );
  const bySubject = {};
  lecturesR.rows.forEach(l => {
    if (!bySubject[l.subject_id]) bySubject[l.subject_id] = [];
    bySubject[l.subject_id].push(l);
  });
  return subjects.rows.map(s => ({ ...s, lectures: bySubject[s.id] || [] }));
};
const createSubject = async (planId, { subject_name }) => {
  const countR = await query(`SELECT COALESCE(MAX(serial_no), 0) AS mx FROM academy_plan_subjects WHERE plan_id=$1`, [planId]);
  const serial_no = parseInt(countR.rows[0].mx) + 1;
  const r = await query(
    `INSERT INTO academy_plan_subjects (plan_id, serial_no, subject_name) VALUES ($1,$2,$3) RETURNING *`,
    [planId, serial_no, subject_name]
  );
  return r.rows[0];
};
const updateSubject = async (id, { subject_name }) => {
  const r = await query(
    `UPDATE academy_plan_subjects SET subject_name=$1 WHERE id=$2 RETURNING *`,
    [subject_name, id]
  );
  return r.rows[0];
};
const deleteSubject = async (id) => {
  await query(`DELETE FROM academy_plan_lectures WHERE subject_id=$1`, [id]);
  await query(`DELETE FROM academy_plan_subjects WHERE id=$1`, [id]);
  return { deleted: true };
};
const importSubject = async (planId, sourceSubjectId) => {
  const srcR = await query(`SELECT * FROM academy_plan_subjects WHERE id=$1`, [sourceSubjectId]);
  if (!srcR.rows.length) throw { statusCode: 404, message: 'Source subject পাওয়া যায়নি' };
  const src = srcR.rows[0];
  const newSub = await createSubject(planId, { subject_name: src.subject_name + ' (copied)' });
  const lectures = await query(`SELECT * FROM academy_plan_lectures WHERE subject_id=$1 ORDER BY serial_no`, [sourceSubjectId]);
  for (const lec of lectures.rows) {
    await query(
      `INSERT INTO academy_plan_lectures (subject_id, serial_no, lecture_no, title, duration_min, is_practical)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [newSub.id, lec.serial_no, lec.lecture_no, lec.title, lec.duration_min, lec.is_practical]
    );
  }
  return newSub;
};

// ── Plan Lectures ─────────────────────────────────────────────────────────────
const saveLectures = async (subjectId, lectures) => {
  await query(`DELETE FROM academy_plan_lectures WHERE subject_id=$1`, [subjectId]);
  for (let i = 0; i < lectures.length; i++) {
    const { title, duration_min, is_practical } = lectures[i];
    await query(
      `INSERT INTO academy_plan_lectures (subject_id, serial_no, lecture_no, title, duration_min, is_practical)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [subjectId, i + 1, i + 1, title, duration_min || 60, is_practical || false]
    );
  }
  return { saved: lectures.length };
};

// ── Batches ───────────────────────────────────────────────────────────────────
const getBatches = async () => {
  const r = await query(
    `SELECT b.*, c.course_name, c.course_code, p.plan_name,
            COUNT(DISTINCT CASE WHEN bo.row_type='class' THEN bo.id END) AS total_classes,
            COUNT(DISTINCT CASE WHEN bo.row_type='class' AND bo.status='done' THEN bo.id END) AS done_classes
     FROM academy_batches b
     JOIN academy_courses c ON c.id = b.course_id
     LEFT JOIN academy_course_plans p ON p.id = b.plan_id
     LEFT JOIN academy_batch_outline bo ON bo.batch_id = b.id
     GROUP BY b.id, c.course_name, c.course_code, p.plan_name
     ORDER BY b.created_at DESC`
  );
  return r.rows;
};
const createBatch = async ({ course_id, plan_id, batch_name, zoom_account_id, start_date, end_date, max_students, notes }) => {
  const r = await query(
    `INSERT INTO academy_batches (course_id, plan_id, batch_name, zoom_account_id, start_date, end_date, max_students, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [course_id, plan_id || null, batch_name, zoom_account_id || null,
     start_date || null, end_date || null, max_students || null, notes || null]
  );
  return r.rows[0];
};
const updateBatch = async (id, data) => {
  const { batch_name, zoom_account_id, start_date, end_date, max_students, status, notes } = data;
  const r = await query(
    `UPDATE academy_batches SET batch_name=$1, zoom_account_id=$2, start_date=$3, end_date=$4,
     max_students=$5, status=$6, notes=$7, updated_at=NOW()
     WHERE id=$8 RETURNING *`,
    [batch_name, zoom_account_id || null, start_date || null, end_date || null,
     max_students || null, status || 'upcoming', notes || null, id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const deleteBatch = async (id) => {
  await query(`UPDATE academy_batch_outline SET feedback_id=NULL WHERE batch_id=$1`, [id]);
  await query(`DELETE FROM academy_outline_history WHERE outline_id IN (SELECT id FROM academy_batch_outline WHERE batch_id=$1)`, [id]);
  await query(`DELETE FROM academy_class_feedback WHERE outline_id IN (SELECT id FROM academy_batch_outline WHERE batch_id=$1)`, [id]);
  await query(`DELETE FROM academy_teacher_payments WHERE batch_id=$1`, [id]);
  await query(`DELETE FROM academy_batch_outline WHERE batch_id=$1`, [id]);
  await query(`DELETE FROM academy_batches WHERE id=$1`, [id]);
  return { deleted: true };
};

// ── Batch Outline ─────────────────────────────────────────────────────────────
const getBatchOutline = async (batchId) => {
  const r = await query(
    `SELECT bo.*,
            t.full_name AS teacher_name, t.teacher_code,
            cf.id AS feedback_id, cf.status AS feedback_status, cf.submitted_at AS feedback_submitted_at,
            tp.status AS payment_status, tp.amount AS payment_amount
     FROM academy_batch_outline bo
     LEFT JOIN academy_teachers t ON t.id = bo.teacher_id
     LEFT JOIN academy_class_feedback cf ON cf.outline_id = bo.id
     LEFT JOIN academy_teacher_payments tp ON tp.outline_id = bo.id
     WHERE bo.batch_id = $1
     ORDER BY bo.row_no`,
    [batchId]
  );
  return r.rows;
};

const addOutlineRow = async (batchId, data, createdBy) => {
  const { row_type, topic, scheduled_date, scheduled_time, class_type, teacher_id, zoom_link, notes } = data;

  const maxR = await query(`SELECT COALESCE(MAX(row_no), 0) AS mx FROM academy_batch_outline WHERE batch_id=$1`, [batchId]);
  const row_no = parseInt(maxR.rows[0].mx) + 1;

  let class_no = null;
  if (row_type === 'class') {
    const cntR = await query(`SELECT COUNT(*) FROM academy_batch_outline WHERE batch_id=$1 AND row_type='class'`, [batchId]);
    class_no = parseInt(cntR.rows[0].count) + 1;
  }

  const r = await query(
    `INSERT INTO academy_batch_outline
     (batch_id, row_no, row_type, class_no, topic, scheduled_date, scheduled_time, class_type, teacher_id, zoom_link, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [batchId, row_no, row_type || 'class', class_no, topic || null,
     scheduled_date || null, scheduled_time || null, class_type || 'regular',
     teacher_id || null, zoom_link || null, notes || null]
  );
  return r.rows[0];
};

const updateOutlineRow = async (id, data, updatedBy) => {
  const existing = await query(`SELECT * FROM academy_batch_outline WHERE id=$1`, [id]);
  if (!existing.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  const old = existing.rows[0];

  const { topic, scheduled_date, scheduled_time, class_type, teacher_id, zoom_link, status, notes } = data;

  // Track history for key changes
  const trackFields = ['scheduled_date', 'teacher_id', 'status'];
  const oldVals = {}, newVals = {};
  let changed = false;
  for (const field of trackFields) {
    const ov = String(old[field] || '');
    const nv = String(data[field] !== undefined ? data[field] : old[field] || '');
    if (ov !== nv) { oldVals[field] = ov; newVals[field] = nv; changed = true; }
  }
  if (changed) {
    await query(
      `INSERT INTO academy_outline_history (outline_id, changed_by, old_values, new_values) VALUES ($1,$2,$3,$4)`,
      [id, updatedBy, JSON.stringify(oldVals), JSON.stringify(newVals)]
    );
  }

  const r = await query(
    `UPDATE academy_batch_outline SET topic=$1, scheduled_date=$2, scheduled_time=$3,
     class_type=$4, teacher_id=$5, zoom_link=$6, status=$7, notes=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [topic ?? old.topic, scheduled_date ?? old.scheduled_date, scheduled_time ?? old.scheduled_time,
     class_type ?? old.class_type, teacher_id ?? old.teacher_id,
     zoom_link ?? old.zoom_link, status ?? old.status, notes ?? old.notes, id]
  );
  return r.rows[0];
};

const deleteOutlineRow = async (id) => {
  await query(`UPDATE academy_batch_outline SET feedback_id=NULL WHERE id=$1`, [id]);
  await query(`DELETE FROM academy_outline_history WHERE outline_id=$1`, [id]);
  await query(`DELETE FROM academy_class_feedback WHERE outline_id=$1`, [id]);
  await query(`DELETE FROM academy_teacher_payments WHERE outline_id=$1`, [id]);
  await query(`DELETE FROM academy_batch_outline WHERE id=$1`, [id]);
  return { deleted: true };
};

const reorderOutline = async (batchId, orderedIds) => {
  for (let i = 0; i < orderedIds.length; i++) {
    await query(`UPDATE academy_batch_outline SET row_no=$1 WHERE id=$2 AND batch_id=$3`, [i + 1, orderedIds[i], batchId]);
  }
  return { reordered: true };
};

// ── Class Feedback ────────────────────────────────────────────────────────────
const submitFeedback = async (outlineId, teacherId, note) => {
  const exists = await query(`SELECT id FROM academy_class_feedback WHERE outline_id=$1 AND teacher_id=$2`, [outlineId, teacherId]);
  if (exists.rows.length) throw { statusCode: 400, message: 'ইতিমধ্যে feedback দেওয়া হয়েছে' };
  const r = await query(
    `INSERT INTO academy_class_feedback (outline_id, teacher_id, note) VALUES ($1,$2,$3) RETURNING *`,
    [outlineId, teacherId, note || null]
  );
  return r.rows[0];
};

const getPendingFeedbacks = async () => {
  const r = await query(
    `SELECT cf.*, bo.topic, bo.scheduled_date, bo.class_no, b.batch_name, c.course_name,
            t.full_name AS teacher_name, t.teacher_code
     FROM academy_class_feedback cf
     JOIN academy_batch_outline bo ON bo.id = cf.outline_id
     JOIN academy_batches b ON b.id = bo.batch_id
     JOIN academy_courses c ON c.id = b.course_id
     JOIN academy_teachers t ON t.id = cf.teacher_id
     WHERE cf.status = 'pending'
     ORDER BY cf.submitted_at DESC`
  );
  return r.rows;
};

const approveFeedback = async (feedbackId, adminId, approved) => {
  const cfR = await query(`SELECT * FROM academy_class_feedback WHERE id=$1`, [feedbackId]);
  if (!cfR.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  const cf = cfR.rows[0];

  const newStatus = approved ? 'approved' : 'rejected';
  await query(
    `UPDATE academy_class_feedback SET status=$1, reviewed_by=$2, reviewed_at=NOW(), approved=$3 WHERE id=$4`,
    [newStatus, adminId, approved, feedbackId]
  );

  if (approved) {
    await query(`UPDATE academy_batch_outline SET status='done', updated_at=NOW() WHERE id=$1`, [cf.outline_id]);

    const outlineR = await query(
      `SELECT bo.*, t.teacher_type FROM academy_batch_outline bo
       JOIN academy_teachers t ON t.id = bo.teacher_id
       WHERE bo.id=$1`, [cf.outline_id]
    );
    if (outlineR.rows.length) {
      const outline = outlineR.rows[0];
      const rateR = await query(
        `SELECT rate_per_class FROM academy_payment_rates WHERE teacher_type=$1 AND class_type=$2`,
        [outline.teacher_type, outline.class_type || 'regular']
      );
      const amount = rateR.rows.length ? parseFloat(rateR.rows[0].rate_per_class) : 0;
      if (amount > 0) {
        await query(
          `INSERT INTO academy_teacher_payments (teacher_id, outline_id, batch_id, class_date, class_type, amount)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [cf.teacher_id, cf.outline_id, outline.batch_id,
           outline.scheduled_date, outline.class_type, amount]
        );
      }
    }
  }
  return { success: true, status: newStatus };
};

// ── Teacher Payments ──────────────────────────────────────────────────────────
const getTeacherPayments = async (teacherId) => {
  const params = teacherId ? [teacherId] : [];
  const where = teacherId ? 'WHERE tp.teacher_id=$1' : '';
  const r = await query(
    `SELECT tp.*, t.full_name AS teacher_name, t.teacher_code,
            bo.class_no, bo.topic, bo.scheduled_date AS class_date, b.batch_name
     FROM academy_teacher_payments tp
     JOIN academy_teachers t ON t.id = tp.teacher_id
     LEFT JOIN academy_batch_outline bo ON bo.id = tp.outline_id
     LEFT JOIN academy_batches b ON b.id = tp.batch_id
     ${where}
     ORDER BY tp.created_at DESC`,
    params
  );
  return r.rows;
};

const payTeacher = async ({ payment_ids, note, paid_by }) => {
  const pendingR = await query(
    `SELECT SUM(amount) AS total FROM academy_teacher_payments WHERE id=ANY($1) AND status='pending'`,
    [payment_ids]
  );
  const total = parseFloat(pendingR.rows[0].total || 0);
  if (total <= 0) throw { statusCode: 400, message: 'কোনো pending payment নেই' };

  await query(
    `UPDATE academy_teacher_payments SET status='paid', paid_at=NOW(), paid_by=$1, payment_note=$2
     WHERE id=ANY($3) AND status='pending'`,
    [paid_by, note || null, payment_ids]
  );
  return { paid: total };
};

// ── Reports ───────────────────────────────────────────────────────────────────
const getScheduleReport = async ({ teacher_id, batch_id, status, month, row_type }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (teacher_id) { conditions.push(`bo.teacher_id=$${idx++}`); params.push(teacher_id); }
  if (batch_id)   { conditions.push(`bo.batch_id=$${idx++}`); params.push(batch_id); }
  if (status)     { conditions.push(`bo.status=$${idx++}`); params.push(status); }
  if (row_type)   { conditions.push(`bo.row_type=$${idx++}`); params.push(row_type); }
  if (month)      { conditions.push(`TO_CHAR(bo.scheduled_date,'YYYY-MM')=$${idx++}`); params.push(month); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const r = await query(
    `SELECT bo.*, b.batch_name, c.course_name,
            t.full_name AS teacher_name, t.phone AS teacher_phone
     FROM academy_batch_outline bo
     JOIN academy_batches b ON b.id = bo.batch_id
     JOIN academy_courses c ON c.id = b.course_id
     LEFT JOIN academy_teachers t ON t.id = bo.teacher_id
     ${where}
     ORDER BY bo.scheduled_date NULLS LAST, bo.scheduled_time`,
    params
  );
  return r.rows;
};

module.exports = {
  getZoomAccounts, createZoomAccount, updateZoomAccount, deleteZoomAccount,
  getPaymentRates, upsertPaymentRate, deletePaymentRate,
  getTeachers, getTeacher, createTeacher, updateTeacher, deleteTeacher, getTeacherHistory,
  getCourses, createCourse, updateCourse, deleteCourse,
  getCoursePlans, createPlan, updatePlan, deletePlan,
  getPlanSubjects, createSubject, updateSubject, deleteSubject, importSubject,
  saveLectures,
  getBatches, createBatch, updateBatch, deleteBatch,
  getBatchOutline, addOutlineRow, updateOutlineRow, deleteOutlineRow, reorderOutline,
  submitFeedback, getPendingFeedbacks, approveFeedback,
  getTeacherPayments, payTeacher,
  getScheduleReport,
};
