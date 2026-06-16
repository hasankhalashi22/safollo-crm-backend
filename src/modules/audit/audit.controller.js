const auditService = require('./audit.service');

const getLogs = async (req, res, next) => {
  try {
    const { page, limit, module, action, user_id, date_from, date_to } = req.query;
    const result = await auditService.getLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      module, action, user_id, date_from, date_to,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

module.exports = { getLogs };