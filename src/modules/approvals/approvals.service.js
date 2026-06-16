const syncService = require('../accounting/sync.service');
const { query, withTransaction } = require('../../config/database');

const getPendingApprovals = async ({ userId, roleLevel }) => {
  let conditions = [`e.approval_status = 'pending'`];
  let params = [];
  let idx = 1;

  if (roleLevel === 3) {
    conditions.push(`e.executive_id IN (SELECT id FROM users WHERE manager_id = $${idx++} OR id = $${idx++})`);
    params.push(userId, userId);
  }

  const result = await query(
    `SELECT e.*,
            s.phone as student_phone, s.name as student_name,
            c.name as course_name, b.name as batch_name,
            sp.full_name as executive_name,
            u.phone as executive_phone,
            (e.course_price - e.total_collected) as due_amount,
            json_agg(
              json_build_object(
                'id', p.id,
                'amount', p.amount,
                'payment_method', p.payment_method,
                'transaction_id', p.transaction_id,
                'payment_proof_url', p.payment_proof_url,
                'created_at', p.created_at,
                'is_due_payment', p.is_due_payment,
                'approval_status', p.approval_status
              ) ORDER BY p.created_at
            ) FILTER (WHERE p.id IS NOT NULL) as payment_history
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     JOIN users u ON u.id = e.executive_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN payments p ON p.enrollment_id = e.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY e.id, s.phone, s.name, c.name, b.name, sp.full_name, u.phone
     ORDER BY e.created_at DESC`,
    params
  );

  return { data: result.rows, total: result.rows.length };
};

// Pending due payments
const getPendingDuePayments = async ({ userId, roleLevel }) => {
  let conditions = [`p.approval_status = 'pending'`, `p.is_due_payment = TRUE`];
  let params = [];
  let idx = 1;

  if (roleLevel === 3) {
    conditions.push(`e.executive_id IN (SELECT id FROM users WHERE manager_id = $${idx++} OR id = $${idx++})`);
    params.push(userId, userId);
  }

  const result = await query(
    `SELECT p.*,
            s.phone as student_phone, s.name as student_name,
            c.name as course_name, b.name as batch_name,
            sp.full_name as executive_name,
            e.course_price,
            e.total_collected,
            (e.course_price - e.total_collected) as remaining_due,
            (
              SELECT json_agg(
                json_build_object(
                  'id', ph.id,
                  'amount', ph.amount,
                  'payment_method', ph.payment_method,
                  'transaction_id', ph.transaction_id,
                  'payment_proof_url', ph.payment_proof_url,
                  'created_at', ph.created_at,
                  'is_due_payment', ph.is_due_payment,
                  'approval_status', ph.approval_status
                ) ORDER BY ph.created_at
              )
              FROM payments ph WHERE ph.enrollment_id = e.id
            ) as full_payment_history
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     JOIN users u ON u.id = e.executive_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.created_at DESC`,
    params
  );

  return { data: result.rows, total: result.rows.length };
};

const approveSale = async (enrollmentId, approverId, approverName, editData) => {
  return await withTransaction(async (client) => {
    const enrollResult = await client.query(
      'SELECT * FROM enrollments WHERE id = $1',
      [enrollmentId]
    );
    if (enrollResult.rows.length === 0) throw { statusCode: 404, message: 'সেল পাওয়া যায়নি' };

    const enrollment = enrollResult.rows[0];
    if (enrollment.approval_status !== 'pending') {
      throw { statusCode: 400, message: 'এই সেল আগেই process হয়েছে' };
    }

    const fields = [
      `approval_status = 'approved'`,
      `approved_by = '${approverId}'`,
      `approved_at = NOW()`,
      `approver_name = '${approverName}'`,
    ];

    if (editData?.course_price) fields.push(`course_price = ${parseFloat(editData.course_price)}`);
    if (editData?.reference !== undefined) fields.push(`reference = '${editData.reference}'`);
    if (editData?.notes !== undefined) fields.push(`notes = '${editData.notes}'`);

    const result = await client.query(
      `UPDATE enrollments SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      [enrollmentId]
    );

    // Approve all payments for this enrollment
    await client.query(
      `UPDATE payments SET approval_status = 'approved', approved_by = $1, approved_at = NOW(), approver_name = $2
       WHERE enrollment_id = $3`,
      [approverId, approverName, enrollmentId]
    );

    // Get the first payment for sync
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE enrollment_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [enrollmentId]
    );

    return { enrollment: result.rows[0], payment: paymentResult.rows[0] };
  });
};

const rejectSale = async (enrollmentId, rejectorId, rejectorName, reason) => {
  const result = await query(
    `UPDATE enrollments SET
       approval_status = 'rejected',
       rejected_by = $2,
       rejected_at = NOW(),
       rejection_reason = $3
     WHERE id = $1 AND approval_status = 'pending'
     RETURNING *`,
    [enrollmentId, rejectorId, reason || null]
  );

  if (result.rows.length === 0) throw { statusCode: 400, message: 'সেল পাওয়া যায়নি বা আগেই process হয়েছে' };
  return result.rows[0];
};

// Approve due payment
const approveDuePayment = async (paymentId, approverId, approverName) => {
  const result = await query(
    `UPDATE payments SET
       approval_status = 'approved',
       approved_by = $2,
       approved_at = NOW(),
       approver_name = $3
     WHERE id = $1 AND approval_status = 'pending'
     RETURNING *`,
    [paymentId, approverId, approverName]
  );

  if (result.rows.length === 0) throw { statusCode: 400, message: 'Payment পাওয়া যায়নি বা আগেই process হয়েছে' };
  return result.rows[0];
};

// Reject due payment
const rejectDuePayment = async (paymentId, rejectorId, reason) => {
  return await withTransaction(async (client) => {
    const paymentResult = await client.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );
    if (paymentResult.rows.length === 0) throw { statusCode: 404, message: 'Payment পাওয়া যায়নি' };

    const payment = paymentResult.rows[0];

    // Reverse the payment amount from enrollment
    await client.query(
      `UPDATE enrollments SET
         total_collected = total_collected - $1,
         payment_status = CASE
           WHEN total_collected - $1 <= 0 THEN 'due'
           WHEN total_collected - $1 < course_price THEN 'partial'
           ELSE 'paid'
         END
       WHERE id = $2`,
      [payment.amount, payment.enrollment_id]
    );

    // Mark payment as rejected
    const result = await client.query(
      `UPDATE payments SET
         approval_status = 'rejected',
         rejected_by = $2,
         rejected_at = NOW(),
         rejection_reason = $3
       WHERE id = $1
       RETURNING *`,
      [paymentId, rejectorId, reason || null]
    );

    return result.rows[0];
  });
};

const resubmitSale = async (enrollmentId, executiveId, editData) => {
  const enrollResult = await query(
    'SELECT * FROM enrollments WHERE id = $1 AND executive_id = $2',
    [enrollmentId, executiveId]
  );

  if (enrollResult.rows.length === 0) throw { statusCode: 404, message: 'সেল পাওয়া যায়নি' };
  if (enrollResult.rows[0].approval_status !== 'rejected') {
    throw { statusCode: 400, message: 'শুধু rejected সেল resubmit করা যাবে' };
  }

  const fields = [
    `approval_status = 'pending'`,
    `rejection_reason = NULL`,
    `rejected_by = NULL`,
    `rejected_at = NULL`,
  ];
  const params = [enrollmentId];
  let idx = 2;

  if (editData?.course_price) { fields.push(`course_price = $${idx++}`); params.push(parseFloat(editData.course_price)); }
  if (editData?.reference !== undefined) { fields.push(`reference = $${idx++}`); params.push(editData.reference); }
  if (editData?.notes !== undefined) { fields.push(`notes = $${idx++}`); params.push(editData.notes); }

  const result = await query(
    `UPDATE enrollments SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0];
};

const getMyPendingList = async (executiveId) => {
  const result = await query(
    `SELECT e.*,
            s.phone as student_phone, s.name as student_name,
            c.name as course_name, b.name as batch_name,
            (e.course_price - e.total_collected) as due_amount,
            json_agg(
              json_build_object(
                'amount', p.amount,
                'payment_method', p.payment_method,
                'payment_proof_url', p.payment_proof_url
              ) ORDER BY p.created_at
            ) FILTER (WHERE p.id IS NOT NULL) as payment_history
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN batches b ON b.id = e.batch_id
     LEFT JOIN payments p ON p.enrollment_id = e.id
     WHERE e.executive_id = $1 AND e.approval_status IN ('pending', 'rejected')
     GROUP BY e.id, s.phone, s.name, c.name, b.name
     ORDER BY e.created_at DESC`,
    [executiveId]
  );

  return { data: result.rows };
};

const getMyPendingDue = async (executiveId) => {
  const result = await query(
    `SELECT p.*,
            s.phone as student_phone, s.name as student_name,
            c.name as course_name,
            e.course_price,
            e.total_collected,
            (e.course_price - e.total_collected) as remaining_due
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     WHERE p.approval_status IN ('pending', 'rejected')
       AND p.is_due_payment = TRUE
       AND p.executive_id = $1
     ORDER BY p.created_at DESC`,
    [executiveId]
  );
  return { data: result.rows };
};

const resubmitDuePayment = async (paymentId) => {
  const result = await query(
    `UPDATE payments SET
       approval_status = 'pending',
       rejection_reason = NULL,
       rejected_by = NULL,
       rejected_at = NULL
     WHERE id = $1 AND approval_status = 'rejected'
     RETURNING *`,
    [paymentId]
  );
  if (result.rows.length === 0) throw { statusCode: 400, message: 'Payment পাওয়া যায়নি' };
  return result.rows[0];
};
module.exports = {
  getPendingApprovals, getPendingDuePayments,
  getMyPendingList, getMyPendingDue,
  approveSale, rejectSale, resubmitSale,
  approveDuePayment, rejectDuePayment, resubmitDuePayment
};