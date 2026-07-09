const { query, withTransaction } = require('../../config/database');

const createSale = async (data, executiveId, paymentProofFile) => {
  const {
    student_phone, student_name, course_id, batch_id,
    course_price, collected_amount, payment_method,
    transaction_id, due_date, reference, notes,
    override_executive_id, sender_number
  } = data;

  const actualExecutiveId = override_executive_id || executiveId;

  return await withTransaction(async (client) => {
    const studentResult = await client.query(
      `INSERT INTO students (phone, name)
       VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, students.name),
         updated_at = NOW()
       RETURNING *`,
      [student_phone, student_name || null]
    );
    const student = studentResult.rows[0];

    let enrollment;
    const existingEnrollment = await client.query(
      'SELECT * FROM enrollments WHERE student_id = $1 AND course_id = $2',
      [student.id, course_id]
    );

    if (existingEnrollment.rows.length > 0) {
      enrollment = existingEnrollment.rows[0];
    } else {
      const enrollResult = await client.query(
        `INSERT INTO enrollments
           (student_id, course_id, batch_id, course_price, executive_id, reference, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [student.id, course_id, batch_id || null, course_price,
         actualExecutiveId, reference || null, notes || null]
      );
      enrollment = enrollResult.rows[0];
    }

    const paymentProofUrl = paymentProofFile?.path || null;
    const paymentProofPid = paymentProofFile?.filename || null;

    const paymentResult = await client.query(
      `INSERT INTO payments
         (enrollment_id, student_id, amount, payment_method,
          transaction_id, payment_proof_url, payment_proof_pid,
          due_date, is_due_payment, executive_id, notes, sender_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        enrollment.id, student.id, collected_amount, payment_method,
        transaction_id || null, paymentProofUrl, paymentProofPid,
        due_date || null,
        existingEnrollment.rows.length > 0,
        actualExecutiveId, notes || null, sender_number || null
      ]
    );

    const fullResult = await client.query(
      `SELECT e.*, s.phone as student_phone, s.name as student_name,
              c.name as course_name, b.name as batch_name,
              sp.full_name as executive_name
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN batches b ON b.id = e.batch_id
       JOIN users u ON u.id = e.executive_id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE e.id = $1`,
      [enrollment.id]
    );

    return {
      enrollment: fullResult.rows[0],
      payment: paymentResult.rows[0],
    };
  });
};

const addDuePayment = async (data, executiveId, paymentProofFile) => {
  const { enrollment_id, amount, payment_method, transaction_id, due_date, notes, sender_number } = data;

  const enrollResult = await query(
    `SELECT e.*, s.phone, s.name FROM enrollments e
     JOIN students s ON s.id = e.student_id
     WHERE e.id = $1`,
    [enrollment_id]
  );

  if (enrollResult.rows.length === 0) {
    throw { statusCode: 404, message: 'এনরোলমেন্ট পাওয়া যায়নি' };
  }

  const enrollment = enrollResult.rows[0];

  if (enrollment.payment_status === 'paid') {
    throw { statusCode: 400, message: 'এই স্টুডেন্টের পেমেন্ট সম্পূর্ণ হয়ে গেছে' };
  }

  const remainingDue = enrollment.course_price - enrollment.total_collected;
  if (amount > remainingDue) {
    throw { statusCode: 400, message: `বাকি আছে মাত্র ৳${remainingDue}। এর বেশি নেওয়া যাবে না।` };
  }

  const paymentProofUrl = paymentProofFile?.path || null;
  const paymentProofPid = paymentProofFile?.filename || null;

  const paymentResult = await query(
    `INSERT INTO payments
       (enrollment_id, student_id, amount, payment_method,
        transaction_id, payment_proof_url, payment_proof_pid,
        due_date, is_due_payment, executive_id, notes, sender_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, $11)
     RETURNING *`,
    [
      enrollment_id, enrollment.student_id, amount, payment_method,
      transaction_id || null, paymentProofUrl, paymentProofPid,
      due_date || null, executiveId, notes || null, sender_number || null
    ]
  );

  const updatedEnrollment = await query(
    'SELECT * FROM enrollments WHERE id = $1',
    [enrollment_id]
  );

  return {
    payment: paymentResult.rows[0],
    enrollment: updatedEnrollment.rows[0],
  };
};

const getSales = async ({ executiveId, role, roleLevel, page = 1, limit = 20,
                           course_id, payment_status, date_from, date_to, search, filter_executive_id, payment_method }) => {
  const conditions = [`e.approval_status = 'approved'`];
  const params = [];
  let idx = 1;

  if (roleLevel >= 4) {
    conditions.push(`e.executive_id = $${idx++}`);
    params.push(executiveId);
  } else if (roleLevel === 3) {
    conditions.push(`e.executive_id IN (SELECT id FROM users WHERE manager_id = $${idx++} OR id = $${idx++})`);
    params.push(executiveId, executiveId);
  }
console.log('Manager query conditions:', conditions);
console.log('Manager params:', params);

  if (filter_executive_id && roleLevel <= 2) {
    conditions.push(`e.executive_id = $${idx++}`);
    params.push(filter_executive_id);
  }

  if (course_id) { conditions.push(`e.course_id = $${idx++}`); params.push(course_id); }
  if (payment_status) { conditions.push(`e.payment_status = $${idx++}`); params.push(payment_status); }
  if (date_from) { conditions.push(`e.created_at >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`e.created_at <= $${idx++}`); params.push(date_to + ' 23:59:59'); }
  if (search) {
    const searchParam = `%${search}%`;
    conditions.push(`(s.phone ILIKE $${idx} OR s.name ILIKE $${idx})`);
    params.push(searchParam);
    idx++;
  }
  if (payment_method) {
    conditions.push(`EXISTS (SELECT 1 FROM payments p WHERE p.enrollment_id = e.id AND p.payment_method = $${idx++} AND p.approval_status = 'approved')`);
    params.push(payment_method);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT e.*,
            s.phone as student_phone, s.name as student_name,
            c.name as course_name, c.short_name as course_short,
            b.name as batch_name,
            sp.full_name as executive_name,
            e.approver_name,
            e.approved_at,
            e.approval_status,
            (e.course_price - e.total_collected) as due_amount,
            (SELECT json_agg(
              json_build_object(
                'id', p.id,
                'amount', p.amount,
                'payment_method', p.payment_method,
                'transaction_id', p.transaction_id,
                'sender_number', p.sender_number,
                'payment_proof_url', p.payment_proof_url,
                'is_due_payment', p.is_due_payment,
                'approval_status', p.approval_status,
                'created_at', p.created_at
              ) ORDER BY p.created_at
            ) FROM payments p WHERE p.enrollment_id = e.id) as payment_history
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     JOIN users u ON u.id = e.executive_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     ${where}
     ORDER BY e.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM enrollments e
     JOIN students s ON s.id = e.student_id
     ${where}`,
    params
  );

  return {
    data: result.rows,
    total: parseInt(countResult.rows[0].count),
    page, limit,
  };
};

const getSaleById = async (enrollmentId, userId, roleLevel) => {
  const result = await query(
    `SELECT e.*,
            s.phone as student_phone, s.name as student_name,
            c.name as course_name, b.name as batch_name,
            sp.full_name as executive_name,
            (e.course_price - e.total_collected) as due_amount,
            json_agg(
              json_build_object(
                'id', p.id, 'amount', p.amount,
                'payment_method', p.payment_method,
                'transaction_id', p.transaction_id,
                'sender_number', p.sender_number,
                'payment_proof_url', p.payment_proof_url,
                'is_due_payment', p.is_due_payment,
                'due_date', p.due_date,
                'notes', p.notes,
                'created_at', p.created_at,
                'collected_by_name', COALESCE(sp2.full_name, u2.phone)
              ) ORDER BY p.created_at
            ) FILTER (WHERE p.id IS NOT NULL) as payment_history
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     JOIN users u ON u.id = e.executive_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN payments p ON p.enrollment_id = e.id
     LEFT JOIN users u2 ON u2.id = p.executive_id
     LEFT JOIN staff_profiles sp2 ON sp2.user_id = u2.id
     WHERE e.id = $1
     GROUP BY e.id, s.phone, s.name, c.name, b.name, sp.full_name, u.id`,
    [enrollmentId]
  );

  if (result.rows.length === 0) throw { statusCode: 404, message: 'সেল পাওয়া যায়নি' };

  const sale = result.rows[0];
  if (roleLevel >= 4 && sale.executive_id !== userId) {
    throw { statusCode: 403, message: 'এই তথ্য দেখার অনুমতি নেই' };
  }

  return sale;
};

const getDueList = async ({ executiveId, roleLevel, page = 1, limit = 20 }) => {
  const conditions = [`e.payment_status IN ('due', 'partial')`, `e.approval_status = 'approved'`, `(e.course_price - e.total_collected) > 0`];
  const params = [];
  let idx = 1;

  console.log('getDueList called with:', { executiveId, roleLevel });

  if (roleLevel >= 4) {
    conditions.push(`e.executive_id = $${idx++}`);
    params.push(executiveId);
  } else if (roleLevel === 3) {
    const managerParam = idx++;
    conditions.push(`e.executive_id IN (SELECT id FROM users WHERE manager_id = $${managerParam} OR id = $${managerParam})`);
    params.push(executiveId);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (page - 1) * limit;

 const result = await query(
    `SELECT e.id, e.course_price, e.total_collected,
            (e.course_price - e.total_collected) as due_amount,
            e.payment_status, e.created_at, e.executive_id,
            s.phone as student_phone, s.name as student_name,
            c.name as course_name, c.is_book, b.name as batch_name,
            sp.full_name as executive_name,
            (SELECT p.due_date FROM payments p
             WHERE p.enrollment_id = e.id
             ORDER BY p.created_at DESC LIMIT 1) as last_due_date
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     JOIN users u ON u.id = e.executive_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     ${where}
     ORDER BY last_due_date ASC NULLS LAST, e.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM enrollments e ${where}`, params
  );

  return {
    data: result.rows,
    total: parseInt(countResult.rows[0].count),
    page, limit,
  };
};

const editSale = async (enrollmentId, data) => {
  const { reference, notes, batch_id, course_price, total_collected, executive_id, created_at, student_name, student_phone } = data;
  const fields = [];
  const params = [];
  let idx = 1;

  if (reference !== undefined) { fields.push(`reference = $${idx++}`); params.push(reference); }
  if (notes !== undefined) { fields.push(`notes = $${idx++}`); params.push(notes); }
  if (batch_id !== undefined) { fields.push(`batch_id = $${idx++}`); params.push(batch_id); }
  if (course_price !== undefined) { fields.push(`course_price = $${idx++}`); params.push(course_price); }
  if (total_collected !== undefined) { fields.push(`total_collected = $${idx++}`); params.push(total_collected); }
  if (executive_id !== undefined) { fields.push(`executive_id = $${idx++}`); params.push(executive_id); }
  if (created_at !== undefined) { fields.push(`created_at = $${idx++}`); params.push(created_at); }

  if (fields.length > 0) {
    fields.push(`updated_at = NOW()`);
    const result = await query(
      `UPDATE enrollments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      [...params, enrollmentId]
    );
    if (result.rows.length === 0) throw { statusCode: 404, message: 'সেল পাওয়া যায়নি' };
  }

  if (student_name !== undefined || student_phone !== undefined) {
    const enrollResult = await query('SELECT student_id FROM enrollments WHERE id = $1', [enrollmentId]);
    if (enrollResult.rows.length === 0) throw { statusCode: 404, message: 'সেল পাওয়া যায়নি' };
    const studentId = enrollResult.rows[0].student_id;

    const studentFields = [];
    const studentParams = [];
    let sidx = 1;
    if (student_name !== undefined) { studentFields.push(`name = $${sidx++}`); studentParams.push(student_name); }
    if (student_phone !== undefined) { studentFields.push(`phone = $${sidx++}`); studentParams.push(student_phone); }
    studentFields.push(`updated_at = NOW()`);

    await query(
      `UPDATE students SET ${studentFields.join(', ')} WHERE id = $${sidx}`,
      [...studentParams, studentId]
    );
  }

// Recalculate payment_status if price/collected changed
  if (course_price !== undefined || total_collected !== undefined) {
    const currentResult = await query('SELECT course_price, total_collected FROM enrollments WHERE id = $1', [enrollmentId]);
    const current = currentResult.rows[0];
    let newStatus;
    if (Number(current.total_collected) >= Number(current.course_price)) {
      newStatus = 'paid';
    } else if (Number(current.total_collected) > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'due';
    }
    await query('UPDATE enrollments SET payment_status = $1 WHERE id = $2', [newStatus, enrollmentId]);
  }

  const finalResult = await query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
  return finalResult.rows[0];
};

const reassignDue = async (enrollmentId, newExecutiveId) => {
  const result = await query(
    `UPDATE enrollments SET executive_id = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [newExecutiveId, enrollmentId]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'এনরোলমেন্ট পাওয়া যায়নি' };
  return result.rows[0];
};

const deleteSale = async (enrollmentId) => {
  await query('DELETE FROM payments WHERE enrollment_id = $1', [enrollmentId]);
  const result = await query('DELETE FROM enrollments WHERE id = $1 RETURNING id', [enrollmentId]);
  if (result.rows.length === 0) throw { statusCode: 404, message: 'সেল পাওয়া যায়নি' };
  return { deleted: true };
};

const getRevenue = async ({ executiveId, roleLevel, course_id, date_from, date_to, search, filter_executive_id, payment_method }) => {
  const conditions = [`p.approval_status = 'approved'`, `e.approval_status = 'approved'`];
  const params = [];
  let idx = 1;

  if (roleLevel >= 4) {
    conditions.push(`p.executive_id = $${idx++}`);
    params.push(executiveId);
  } else if (roleLevel === 3) {
    conditions.push(`p.executive_id IN (SELECT id FROM users WHERE manager_id = $${idx++} OR id = $${idx++})`);
    params.push(executiveId, executiveId);
  }

  if (filter_executive_id && roleLevel <= 2) {
    conditions.push(`p.executive_id = $${idx++}`);
    params.push(filter_executive_id);
  }

if (payment_method) { conditions.push(`p.payment_method = $${idx++}`); params.push(payment_method); }
  if (course_id) { conditions.push(`e.course_id = $${idx++}`); params.push(course_id); }
  if (date_from) { conditions.push(`p.created_at >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`p.created_at <= $${idx++}`); params.push(date_to + ' 23:59:59'); }
  if (search) {
    const searchParam = `%${search}%`;
    conditions.push(`(s.phone ILIKE $${idx} OR s.name ILIKE $${idx})`);
    params.push(searchParam);
    idx++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const result = await query(
    `SELECT p.id, p.created_at as payment_date, p.amount, p.payment_method,
            p.transaction_id, p.sender_number, p.is_due_payment,
            s.phone as student_phone, s.name as student_name,
            c.name as course_name, b.name as batch_name,
            sp.full_name as executive_name
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     JOIN users u ON u.id = p.executive_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     ${where}
     ORDER BY p.created_at DESC`,
    params
  );

  const countResult = await query(
    `SELECT COUNT(*), COALESCE(SUM(p.amount), 0) as total_amount
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN students s ON s.id = e.student_id
     ${where}`,
    params
  );

  return {
    data: result.rows,
    total: parseInt(countResult.rows[0].count),
    total_amount: countResult.rows[0].total_amount,
  };
};

// Book COD: confirm delivery -> create a due payment for the remaining COD amount
const confirmBookDelivery = async (enrollmentId, referenceNumber, executiveId) => {
  const enrollResult = await query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
  if (enrollResult.rows.length === 0) throw { statusCode: 404, message: 'এনরোলমেন্ট পাওয়া যায়নি' };
  const enrollment = enrollResult.rows[0];

  const dueAmount = enrollment.course_price - enrollment.total_collected;
  if (dueAmount <= 0) throw { statusCode: 400, message: 'কোনো বাকি নেই' };

  return await addDuePayment(
    {
      enrollment_id: enrollmentId,
      amount: dueAmount,
      payment_method: 'cod',
      transaction_id: referenceNumber || null,
      due_date: null,
      notes: 'বই ডেলিভারি কনফার্ম (Steadfast)',
      sender_number: null,
    },
    executiveId,
    null
  );
};

// Book COD: mark as returned -> clear the due amount, no revenue
const markBookReturned = async (enrollmentId, referenceNumber) => {
  const enrollResult = await query('SELECT * FROM enrollments WHERE id = $1', [enrollmentId]);
  if (enrollResult.rows.length === 0) throw { statusCode: 404, message: 'এনরোলমেন্ট পাওয়া যায়নি' };
  const enrollment = enrollResult.rows[0];

  const existingNotes = enrollment.notes || '';
  const newNote = `${existingNotes ? existingNotes + ' | ' : ''}বই রিটার্ন — রেফ: ${referenceNumber || 'N/A'}`;

  const result = await query(
    `UPDATE enrollments SET course_price = total_collected, payment_status = 'paid', notes = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [newNote, enrollmentId]
  );
  return result.rows[0];
};

module.exports = { createSale, addDuePayment, getSales, getSaleById, getDueList, editSale, reassignDue, deleteSale, getRevenue, confirmBookDelivery, markBookReturned };