const { addDuePayment, updatePaymentAmount } = require('./payments.service');
const { query } = require('../../config/database');

const addPayment = async (req, res, next) => {
  try {
    const result = await addDuePayment(req.body, req.user.id, req.file || null);
    res.status(201).json({ success: true, data: result, message: 'পেমেন্ট রেকর্ড হয়েছে' });
  } catch (err) { next(err); }
};

const cancelPayment = async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM payments WHERE id = $1 AND executive_id = $2 AND approval_status IN ('pending', 'rejected') RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) throw { statusCode: 400, message: 'Payment বাতিল করা যায়নি' };
    res.json({ success: true, message: 'Payment বাতিল হয়েছে' });
  } catch (err) { next(err); }
};

const updatePayment = async (req, res, next) => {
  try {
    const result = await updatePaymentAmount(req.params.id, req.body.amount, req.user.id);
    res.json({ success: true, ...result, message: 'Payment আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

module.exports = { addPayment, cancelPayment, updatePayment };