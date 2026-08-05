const { addDuePayment } = require('../sales/sales.service');
const { query, withTransaction } = require('../../config/database');
const { syncPaymentToAccounting, removeSyncedTransaction } = require('../accounting/sync.service');

const updatePaymentAmount = async (paymentId, newAmount, updatedBy) => {
  return await withTransaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT p.*, e.course_price, e.total_collected
       FROM payments p
       JOIN enrollments e ON e.id = p.enrollment_id
       WHERE p.id = $1`,
      [paymentId]
    );
    if (paymentResult.rows.length === 0) throw { statusCode: 404, message: 'Payment পাওয়া যায়নি' };

    const payment = paymentResult.rows[0];
    const oldAmount = Number(payment.amount);
    newAmount = Number(newAmount);

    if (newAmount <= 0) throw { statusCode: 400, message: 'Amount অবশ্যই শূন্যের বেশি হতে হবে' };

    // Overpayment check: new total after adjustment
    const newTotal = Number(payment.total_collected) - oldAmount + newAmount;
    if (newTotal > Number(payment.course_price)) {
      throw { statusCode: 400, message: `Overpayment হবে। সর্বোচ্চ ৳${Number(payment.course_price) - Number(payment.total_collected) + oldAmount} দেওয়া যাবে।` };
    }

    // Update payment amount
    await client.query(`UPDATE payments SET amount = $1 WHERE id = $2`, [newAmount, paymentId]);

    // Update enrollment total_collected
    await client.query(
      `UPDATE enrollments SET
         total_collected = total_collected - $1 + $2,
         payment_status = CASE
           WHEN total_collected - $1 + $2 >= course_price THEN 'paid'
           WHEN total_collected - $1 + $2 > 0 THEN 'partial'
           ELSE 'due'
         END
       WHERE id = $3`,
      [oldAmount, newAmount, payment.enrollment_id]
    );

    // Re-sync accounting (always re-sync if a transaction already existed, or if approved)
    const hadSync = await client.query('SELECT id FROM acc_transactions WHERE payment_id = $1', [paymentId]);
    if (payment.approval_status === 'approved' || hadSync.rows.length > 0) {
      await removeSyncedTransaction(paymentId);
      const updated = { ...payment, amount: newAmount };
      await syncPaymentToAccounting(updated, payment.enrollment_id, updatedBy);
    }

    return { success: true };
  });
};

const VALID_METHODS = ['bkash', 'nagad', 'rocket', 'cash', 'cod'];

const updatePaymentMethod = async (paymentId, newMethod, updatedBy) => {
  if (!VALID_METHODS.includes(newMethod)) throw { statusCode: 400, message: 'অবৈধ payment method' };

  return await withTransaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT p.*, e.course_price, e.total_collected
       FROM payments p
       JOIN enrollments e ON e.id = p.enrollment_id
       WHERE p.id = $1`,
      [paymentId]
    );
    if (paymentResult.rows.length === 0) throw { statusCode: 404, message: 'Payment পাওয়া যায়নি' };

    const payment = paymentResult.rows[0];

    await client.query(`UPDATE payments SET payment_method = $1 WHERE id = $2`, [newMethod, paymentId]);

    // Re-sync accounting
    const hadSync = await client.query('SELECT id FROM acc_transactions WHERE payment_id = $1', [paymentId]);
    if (payment.approval_status === 'approved' || hadSync.rows.length > 0) {
      await removeSyncedTransaction(paymentId);
      const updated = { ...payment, payment_method: newMethod };
      await syncPaymentToAccounting(updated, payment.enrollment_id, updatedBy);
    }

    return { success: true };
  });
};

const deletePaymentByAdmin = async (paymentId) => {
  return await withTransaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT p.*, e.course_price, e.total_collected
       FROM payments p JOIN enrollments e ON e.id = p.enrollment_id
       WHERE p.id = $1`,
      [paymentId]
    );
    if (paymentResult.rows.length === 0) throw { statusCode: 404, message: 'Payment পাওয়া যায়নি' };

    const payment = paymentResult.rows[0];

    // Reverse from enrollment if approved
    if (payment.approval_status === 'approved') {
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
      await removeSyncedTransaction(paymentId);
    }

    await client.query(`DELETE FROM payments WHERE id = $1`, [paymentId]);
    return { success: true };
  });
};

const updatePaymentDetails = async (paymentId, { payment_date, executive_id }, updatedBy) => {
  return await withTransaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT p.*, e.course_price, e.total_collected
       FROM payments p
       JOIN enrollments e ON e.id = p.enrollment_id
       WHERE p.id = $1`,
      [paymentId]
    );
    if (paymentResult.rows.length === 0) throw { statusCode: 404, message: 'Payment পাওয়া যায়নি' };

    const payment = paymentResult.rows[0];

    const fields = [];
    const params = [];
    let idx = 1;

    if (payment_date) { fields.push(`created_at = $${idx++}`); params.push(payment_date); }
    if (executive_id) { fields.push(`executive_id = $${idx++}`); params.push(executive_id); }

    if (fields.length === 0) throw { statusCode: 400, message: 'কোনো পরিবর্তন নেই' };

    params.push(paymentId);
    await client.query(`UPDATE payments SET ${fields.join(', ')} WHERE id = $${idx}`, params);

    if (payment.approval_status === 'approved') {
      await removeSyncedTransaction(paymentId);
      const updated = {
        ...payment,
        created_at: payment_date ? new Date(payment_date) : payment.created_at,
        executive_id: executive_id || payment.executive_id,
      };
      await syncPaymentToAccounting(updated, payment.enrollment_id, updatedBy);
    }

    return { success: true };
  });
};

module.exports = { addDuePayment, updatePaymentAmount, updatePaymentMethod, updatePaymentDetails, deletePaymentByAdmin };
