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

    // Re-sync accounting if payment was approved
    if (payment.approval_status === 'approved') {
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

    // Re-sync accounting if payment was approved
    if (payment.approval_status === 'approved') {
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

module.exports = { addDuePayment, updatePaymentAmount, updatePaymentMethod, deletePaymentByAdmin };
