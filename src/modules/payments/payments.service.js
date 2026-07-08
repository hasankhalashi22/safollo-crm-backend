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

module.exports = { addDuePayment, updatePaymentAmount };
