const { query } = require('../../config/database');

// ── Zoom Accounts ─────────────────────────────────────────────────────────────
const getZoomAccounts = async () => {
  const r = await query(`SELECT * FROM academy_zoom_accounts ORDER BY label`);
  return r.rows;
};
const createZoomAccount = async ({ label, email }) => {
  const r = await query(
    `INSERT INTO academy_zoom_accounts (label, email) VALUES ($1, $2) RETURNING *`,
    [label, email]
  );
  return r.rows[0];
};
const updateZoomAccount = async (id, { label, email, is_active }) => {
  const r = await query(
    `UPDATE academy_zoom_accounts SET label=$1, email=$2, is_active=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
    [label, email, is_active ?? true, id]
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
const upsertPaymentRate = async ({ teacher_type, class_type, rate_bdt }) => {
  const r = await query(
    `INSERT INTO academy_payment_rates (teacher_type, class_type, rate_bdt)
     VALUES ($1, $2, $3)
     ON CONFLICT (teacher_type, class_type) DO UPDATE SET rate_bdt=$3, updated_at=NOW()
     RETURNING *`,
    [teacher_type, class_type, rate_bdt]
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
       COALESCE(SUM(CASE WHEN p.status='paid' THEN p.amount ELSE 0 END), 0) AS total_paid,
       COUNT(DISTINCT CASE WHEN p.status='pending' THEN p.id END) AS pending_count
     FROM academy_teachers t
     LEFT JOIN academy_teacher_payments p ON p.teacher_id = t.id
     GROUP BY t.id
     ORDER BY t.name`
  );
  return r.rows;
};
const getTeacher = async (id) => {
  const r = await query(`SELECT * FROM academy_teachers WHERE id=$1`, [id]);
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const createTeacher = async (data) => {
  const { name, teacher_type, phone, email, nid, payment_method, payment_number, specializations } = data;
  // Auto-generate teacher_code: TCH-XXXX
  const countR = await query(`SELECT COUNT(*) FROM academy_teachers`);
  const num = String(parseInt(countR.rows[0].count) + 1).padStart(4, '0');
  const teacher_code = `TCH-${num}`;
  const r = await query(
    `INSERT INTO academy_teachers (teacher_code, name, teacher_type, phone, email, nid, payment_method, payment_number, specializations)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [teacher_code, name, teacher_type, phone, email, nid, payment_method, payment_number, JSON.stringify(specializations || [])]
  );
  return r.rows[0];
};
const updateTeacher = async (id, data) => {
  const { name, teacher_type, phone, email, nid, payment_method, payment_number, specializations, is_active } = data;
  const r = await query(
    `UPDATE academy_teachers SET name=$1, teacher_type=$2, phone=$3, email=$4, nid=$5,
     payment_method=$6, payment_number=$7, specializations=$8, is_active=$9, updated_at=NOW()
     WHERE id=$10 RETURNING *`,
    [name, teacher_type, phone, email, nid, payment_method, payment_number, JSON.stringify(specializations || []), is_active ?? true, id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const deleteTeacher = async (id) => {
  const check = await query(`SELECT COUNT(*) FROM academy_teacher_payments WHERE teacher_id=$1`, [id]);
  if (parseInt(check.rows[0].count) > 0) throw { statusCode: 400, message: 'এই টিচারের পেমেন্ট রেকর্ড আছে, মুছে ফেলা যাবে না' };
  await query(`DELETE FROM academy_teachers WHERE id=$1`, [id]);
  return { deleted: true };
};
const getTeacherHistory = async (id) => {
  const sessions = await query(
    `SELECT bo.*, b.batch_name, c.name AS course_name,
            cf.status AS feedback_status, cf.submitted_at,
            tp.status AS payment_status, tp.amount AS payment_amount
     FROM academy_batch_outline bo
     JOIN academy_batches b ON b.id = bo.batch_id
     JOIN academy_courses c ON c.id = b.course_id
     LEFT JOIN academy_class_feedback cf ON cf.outline_id = bo.id AND cf.teacher_id = $1
     LEFT JOIN academy_teacher_payments tp ON tp.outline_id = bo.id AND tp.teacher_id = $1
     WHERE bo.teacher_id = $1 AND bo.row_type = 'class'
     ORDER BY bo.class_date DESC NULLS LAST`,
    [id]
  );
  const payments = await query(
    `SELECT * FROM academy_teacher_payments WHERE teacher_id=$1 ORDER BY created_at DESC`, [id]
  );
  return { sessions: sessions.rows, payments: payments.rows };
};

// ── Courses ───────────────────────────────────────────────────────────────────
const getCourses = async () => {
  const r = await query(
    `SELECT c.*, COUNT(DISTINCT p.id) AS plan_count
     FROM academy_courses c
     LEFT JOIN academy_course_plans p ON p.course_id = c.id
     GROUP BY c.id ORDER BY c.name`
  );
  return r.rows;
};
const createCourse = async ({ name, code, fee_bdt, description }) => {
  const r = await query(
    `INSERT INTO academy_courses (name, code, fee_bdt, description) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, code, fee_bdt, description]
  );
  return r.rows[0];
};
const updateCourse = async (id, { name, code, fee_bdt, description, is_active }) => {
  const r = await query(
    `UPDATE academy_courses SET name=$1, code=$2, fee_bdt=$3, description=$4, is_active=$5, updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [name, code, fee_bdt, description, is_active ?? true, id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const deleteCourse = async (id) => {
  const check = await query(`SELECT COUNT(*) FROM academy_batches WHERE course_id=$1`, [id]);
  if (parseInt(check.rows[0].count) > 0) throw { statusCode: 400, message: 'এই কোর্সে ব্যাচ আছে, মুছে ফেলা যাবে না' };
  await query(`DELETE FROM academy_courses WHERE id=$1`, [id]);
  return { deleted: true };
};

// ── Course Plans ──────────────────────────────────────────────────────────────
const getCoursePlans = async (courseId) => {
  const r = await query(
    `SELECT p.*, COUNT(DISTINCT s.id) AS subject_count,
            COALESCE(SUM(s.lecture_count), 0) AS total_lectures
     FROM academy_course_plans p
     LEFT JOIN (
       SELECT ps.plan_id, COUNT(pl.id) AS lecture_count
       FROM academy_plan_subjects ps
       LEFT JOIN academy_plan_lectures pl ON pl.subject_id = ps.id
       GROUP BY ps.plan_id
     ) s ON s.plan_id = p.id
     WHERE p.course_id = $1
     GROUP BY p.id ORDER BY p.created_at`,
    [courseId]
  );
  return r.rows;
};
const createPlan = async (courseId, { plan_name, description }) => {
  const r = await query(
    `INSERT INTO academy_course_plans (course_id, plan_name, description) VALUES ($1,$2,$3) RETURNING *`,
    [courseId, plan_name, description]
  );
  return r.rows[0];
};
const updatePlan = async (id, { plan_name, description }) => {
  const r = await query(
    `UPDATE academy_course_plans SET plan_name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
    [plan_name, description, id]
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
     GROUP BY ps.id ORDER BY ps.sort_order, ps.created_at`,
    [planId]
  );
  const lecturesR = await query(
    `SELECT pl.* FROM academy_plan_lectures pl
     JOIN academy_plan_subjects ps ON ps.id = pl.subject_id
     WHERE ps.plan_id = $1 ORDER BY pl.serial_no`,
    [planId]
  );
  const lecturesBySubject = {};
  lecturesR.rows.forEach(l => {
    if (!lecturesBySubject[l.subject_id]) lecturesBySubject[l.subject_id] = [];
    lecturesBySubject[l.subject_id].push(l);
  });
  return subjects.rows.map(s => ({ ...s, lectures: lecturesBySubject[s.id] || [] }));
};
const createSubject = async (planId, { subject_name, sort_order }) => {
  const r = await query(
    `INSERT INTO academy_plan_subjects (plan_id, subject_name, sort_order) VALUES ($1,$2,$3) RETURNING *`,
    [planId, subject_name, sort_order || 0]
  );
  return r.rows[0];
};
const updateSubject = async (id, { subject_name, sort_order }) => {
  const r = await query(
    `UPDATE academy_plan_subjects SET subject_name=$1, sort_order=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
    [subject_name, sort_order, id]
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
  const newSub = await createSubject(planId, { subject_name: src.subject_name + ' (imported)', sort_order: src.sort_order });
  const lectures = await query(`SELECT * FROM academy_plan_lectures WHERE subject_id=$1 ORDER BY serial_no`, [sourceSubjectId]);
  for (const lec of lectures.rows) {
    await query(
      `INSERT INTO academy_plan_lectures (subject_id, serial_no, lecture_no, topic, details) VALUES ($1,$2,$3,$4,$5)`,
      [newSub.id, lec.serial_no, lec.lecture_no, lec.topic, lec.details]
    );
  }
  return newSub;
};

// ── Plan Lectures ─────────────────────────────────────────────────────────────
const saveLectures = async (subjectId, lectures) => {
  await query(`DELETE FROM academy_plan_lectures WHERE subject_id=$1`, [subjectId]);
  for (let i = 0; i < lectures.length; i++) {
    const { topic, details } = lectures[i];
    const serial_no = i + 1;
    const lecture_no = `L-${String(serial_no).padStart(2, '0')}`;
    await query(
      `INSERT INTO academy_plan_lectures (subject_id, serial_no, lecture_no, topic, details) VALUES ($1,$2,$3,$4,$5)`,
      [subjectId, serial_no, lecture_no, topic, details || '']
    );
  }
  return { saved: lectures.length };
};

// ── Batches ───────────────────────────────────────────────────────────────────
const getBatches = async () => {
  const r = await query(
    `SELECT b.*, c.name AS course_name, c.code AS course_code, p.plan_name,
            COUNT(DISTINCT CASE WHEN bo.row_type='class' THEN bo.id END) AS total_classes,
            COUNT(DISTINCT CASE WHEN bo.row_type='class' AND bo.status='done' THEN bo.id END) AS done_classes,
            COUNT(DISTINCT CASE WHEN bo.row_type='class' AND bo.status='missed' THEN bo.id END) AS missed_classes
     FROM academy_batches b
     JOIN academy_courses c ON c.id = b.course_id
     LEFT JOIN academy_course_plans p ON p.id = b.plan_id
     LEFT JOIN academy_batch_outline bo ON bo.batch_id = b.id
     GROUP BY b.id, c.name, c.code, p.plan_name
     ORDER BY b.created_at DESC`
  );
  return r.rows;
};
const createBatch = async ({ course_id, plan_id, batch_name, start_date, end_date, max_students, exam_window_hours, exam_start_time }) => {
  const r = await query(
    `INSERT INTO academy_batches (course_id, plan_id, batch_name, start_date, end_date, max_students, exam_window_hours, exam_start_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [course_id, plan_id, batch_name, start_date, end_date, max_students, exam_window_hours || 24, exam_start_time || '10:00']
  );
  return r.rows[0];
};
const updateBatch = async (id, data) => {
  const { batch_name, start_date, end_date, max_students, status, exam_window_hours, exam_start_time } = data;
  const r = await query(
    `UPDATE academy_batches SET batch_name=$1, start_date=$2, end_date=$3, max_students=$4,
     status=$5, exam_window_hours=$6, exam_start_time=$7, updated_at=NOW()
     WHERE id=$8 RETURNING *`,
    [batch_name, start_date, end_date, max_students, status, exam_window_hours || 24, exam_start_time || '10:00', id]
  );
  if (!r.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  return r.rows[0];
};
const deleteBatch = async (id) => {
  await query(`DELETE FROM academy_outline_history WHERE outline_id IN (SELECT id FROM academy_batch_outline WHERE batch_id=$1)`, [id]);
  await query(`DELETE FROM academy_class_feedback WHERE outline_id IN (SELECT id FROM academy_batch_outline WHERE batch_id=$1)`, [id]);
  await query(`DELETE FROM academy_teacher_payments WHERE outline_id IN (SELECT id FROM academy_batch_outline WHERE batch_id=$1)`, [id]);
  await query(`DELETE FROM academy_batch_outline WHERE batch_id=$1`, [id]);
  await query(`DELETE FROM academy_batches WHERE id=$1`, [id]);
  return { deleted: true };
};

// ── Batch Outline ─────────────────────────────────────────────────────────────
const getBatchOutline = async (batchId) => {
  const batch = await query(
    `SELECT b.*, c.name AS course_name, p.plan_name FROM academy_batches b
     JOIN academy_courses c ON c.id = b.course_id
     LEFT JOIN academy_course_plans p ON p.id = b.plan_id
     WHERE b.id=$1`, [batchId]
  );
  if (!batch.rows.length) throw { statusCode: 404, message: 'Batch পাওয়া যায়নি' };

  const outline = await query(
    `SELECT bo.*, t.name AS teacher_name, t.phone AS teacher_phone,
            z.label AS zoom_label, z.email AS zoom_email,
            cf.id AS feedback_id, cf.status AS feedback_status, cf.submitted_at AS feedback_submitted_at,
            tp.status AS payment_status, tp.amount AS payment_amount
     FROM academy_batch_outline bo
     LEFT JOIN academy_teachers t ON t.id = bo.teacher_id
     LEFT JOIN academy_zoom_accounts z ON z.id = bo.zoom_account_id
     LEFT JOIN academy_class_feedback cf ON cf.outline_id = bo.id
     LEFT JOIN academy_teacher_payments tp ON tp.outline_id = bo.id
     WHERE bo.batch_id = $1
     ORDER BY bo.row_no`,
    [batchId]
  );
  return { batch: batch.rows[0], outline: outline.rows };
};

const addOutlineRow = async (batchId, data, createdBy) => {
  const { row_type, subject, topic, details, class_date, start_time, end_time, class_type,
          teacher_id, zoom_account_id, zoom_link, lecture_id } = data;

  // Get next row_no
  const maxR = await query(`SELECT COALESCE(MAX(row_no), 0) AS mx FROM academy_batch_outline WHERE batch_id=$1`, [batchId]);
  const row_no = parseInt(maxR.rows[0].mx) + 1;

  // Auto class_no
  const typeCount = await query(
    `SELECT COUNT(*) FROM academy_batch_outline WHERE batch_id=$1 AND row_type=$2`, [batchId, row_type]
  );
  const prefix = row_type === 'class' ? 'C' : 'E';
  const class_no = `${prefix}-${String(parseInt(typeCount.rows[0].count) + 1).padStart(2, '0')}`;

  const r = await query(
    `INSERT INTO academy_batch_outline
     (batch_id, lecture_id, row_type, row_no, class_no, subject, topic, details, class_date,
      start_time, end_time, class_type, teacher_id, zoom_account_id, zoom_link)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [batchId, lecture_id || null, row_type, row_no, class_no, subject, topic, details || '',
     class_date || null, start_time || null, end_time || null, class_type || 'remote',
     teacher_id || null, zoom_account_id || null, zoom_link || null]
  );
  return r.rows[0];
};

const updateOutlineRow = async (id, data, updatedBy) => {
  const existing = await query(`SELECT * FROM academy_batch_outline WHERE id=$1`, [id]);
  if (!existing.rows.length) throw { statusCode: 404, message: 'পাওয়া যায়নি' };
  const old = existing.rows[0];

  const { subject, topic, details, class_date, start_time, end_time, class_type,
          teacher_id, zoom_account_id, zoom_link, status, notes } = data;

  // Track history for key changes
  const trackFields = ['class_date', 'teacher_id', 'status', 'zoom_account_id'];
  for (const field of trackFields) {
    const oldVal = String(old[field] || '');
    const newVal = String(data[field] !== undefined ? data[field] : old[field] || '');
    if (oldVal !== newVal) {
      await query(
        `INSERT INTO academy_outline_history (outline_id, changed_field, old_value, new_value, changed_by) VALUES ($1,$2,$3,$4,$5)`,
        [id, field, oldVal, newVal, updatedBy]
      );
    }
  }

  const r = await query(
    `UPDATE academy_batch_outline SET subject=$1, topic=$2, details=$3, class_date=$4,
     start_time=$5, end_time=$6, class_type=$7, teacher_id=$8, zoom_account_id=$9,
     zoom_link=$10, status=$11, notes=$12, updated_at=NOW()
     WHERE id=$13 RETURNING *`,
    [subject ?? old.subject, topic ?? old.topic, details ?? old.details,
     class_date ?? old.class_date, start_time ?? old.start_time, end_time ?? old.end_time,
     class_type ?? old.class_type, teacher_id ?? old.teacher_id,
     zoom_account_id ?? old.zoom_account_id, zoom_link ?? old.zoom_link,
     status ?? old.status, notes ?? old.notes, id]
  );
  return r.rows[0];
};

const deleteOutlineRow = async (id) => {
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
    [outlineId, teacherId, note || '']
  );
  return r.rows[0];
};

const getPendingFeedbacks = async () => {
  const r = await query(
    `SELECT cf.*, bo.topic, bo.class_date, bo.class_no, b.batch_name, c.name AS course_name,
            t.name AS teacher_name, t.teacher_code
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
    `UPDATE academy_class_feedback SET status=$1, approved_by=$2, approved_at=NOW() WHERE id=$3`,
    [newStatus, adminId, feedbackId]
  );

  if (approved) {
    // Mark outline as done
    await query(`UPDATE academy_batch_outline SET status='done', updated_at=NOW() WHERE id=$1`, [cf.outline_id]);

    // Auto-create payment entry
    const outlineR = await query(
      `SELECT bo.*, t.teacher_type FROM academy_batch_outline bo
       JOIN academy_teachers t ON t.id = bo.teacher_id
       WHERE bo.id=$1`, [cf.outline_id]
    );
    if (outlineR.rows.length) {
      const outline = outlineR.rows[0];
      const rateR = await query(
        `SELECT rate_bdt FROM academy_payment_rates WHERE teacher_type=$1 AND class_type=$2`,
        [outline.teacher_type, outline.class_type || 'regular']
      );
      const amount = rateR.rows.length ? parseFloat(rateR.rows[0].rate_bdt) : 0;
      if (amount > 0) {
        await query(
          `INSERT INTO academy_teacher_payments (teacher_id, outline_id, amount) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [cf.teacher_id, cf.outline_id, amount]
        );
      }
    }
  }
  return { success: true, status: newStatus };
};

// ── Teacher Payments ──────────────────────────────────────────────────────────
const getTeacherPayments = async (teacherId) => {
  const params = teacherId ? [teacherId] : [];
  const whereClause = teacherId ? 'WHERE tp.teacher_id=$1' : '';
  const r = await query(
    `SELECT tp.*, t.name AS teacher_name, t.teacher_code, t.payment_method, t.payment_number,
            bo.class_no, bo.topic, bo.class_date, b.batch_name
     FROM academy_teacher_payments tp
     JOIN academy_teachers t ON t.id = tp.teacher_id
     JOIN academy_batch_outline bo ON bo.id = tp.outline_id
     JOIN academy_batches b ON b.id = bo.batch_id
     ${whereClause}
     ORDER BY tp.created_at DESC`,
    params
  );
  return r.rows;
};

const payTeacher = async ({ teacher_id, payment_ids, payment_method, transaction_id, proof_url, paid_by }) => {
  // Get total
  const ids = payment_ids;
  const pendingR = await query(
    `SELECT SUM(amount) AS total FROM academy_teacher_payments WHERE id=ANY($1) AND status='pending'`,
    [ids]
  );
  const total = parseFloat(pendingR.rows[0].total || 0);
  if (total <= 0) throw { statusCode: 400, message: 'কোনো pending payment নেই' };

  await query(
    `UPDATE academy_teacher_payments SET status='paid', paid_at=NOW(), payment_method=$1, transaction_id=$2, proof_url=$3, paid_by=$4
     WHERE id=ANY($5) AND status='pending'`,
    [payment_method, transaction_id, proof_url, paid_by, ids]
  );
  return { paid: total };
};

// ── Reports ───────────────────────────────────────────────────────────────────
const getScheduleReport = async ({ teacher_id, batch_id, zoom_account_id, status, month, row_type }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (teacher_id) { conditions.push(`bo.teacher_id=$${idx++}`); params.push(teacher_id); }
  if (batch_id) { conditions.push(`bo.batch_id=$${idx++}`); params.push(batch_id); }
  if (zoom_account_id) { conditions.push(`bo.zoom_account_id=$${idx++}`); params.push(zoom_account_id); }
  if (status) { conditions.push(`bo.status=$${idx++}`); params.push(status); }
  if (row_type) { conditions.push(`bo.row_type=$${idx++}`); params.push(row_type); }
  if (month) {
    conditions.push(`TO_CHAR(bo.class_date, 'YYYY-MM')=$${idx++}`);
    params.push(month);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const r = await query(
    `SELECT bo.*, b.batch_name, c.name AS course_name,
            t.name AS teacher_name, t.phone AS teacher_phone,
            z.label AS zoom_label
     FROM academy_batch_outline bo
     JOIN academy_batches b ON b.id = bo.batch_id
     JOIN academy_courses c ON c.id = b.course_id
     LEFT JOIN academy_teachers t ON t.id = bo.teacher_id
     LEFT JOIN academy_zoom_accounts z ON z.id = bo.zoom_account_id
     ${where}
     ORDER BY bo.class_date NULLS LAST, bo.start_time`,
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
