const salesService = require('./sales.service');
const syncService = require('../accounting/sync.service');

const confirmDelivery = async (req, res, next) => {
  try {
    const { enrollment_id, reference_number } = req.body;
    if (!enrollment_id) return res.status(400).json({ success: false, message: 'enrollment_id দিন' });

    const result = await salesService.confirmBookDelivery(enrollment_id, reference_number, req.user.id);
    res.json({ success: true, data: result, message: 'ডেলিভারি কনফার্ম হয়েছে — Approval pending' });
  } catch (err) { next(err); }
};

const markReturned = async (req, res, next) => {
  try {
    const { enrollment_id, reference_number } = req.body;
    if (!enrollment_id) return res.status(400).json({ success: false, message: 'enrollment_id দিন' });

    const result = await salesService.markBookReturned(enrollment_id, reference_number);
    res.json({ success: true, data: result, message: 'রিটার্ন রেকর্ড হয়েছে ✅' });
  } catch (err) { next(err); }
};

module.exports = { confirmDelivery, markReturned };