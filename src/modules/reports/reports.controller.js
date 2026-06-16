const reportsService = require('./reports.service');

const getDailySummary = async (req, res, next) => {
  try {
    const result = await reportsService.getDailySummary({
      executiveId: req.user.id,
      roleLevel: req.user.role_level,
      date: req.query.date,
    });
    console.log('Daily summary:', JSON.stringify(result.summary));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getMonthlySummary = async (req, res, next) => {
  try {
    const result = await reportsService.getMonthlySummary({
      executiveId: req.user.id,
      roleLevel: req.user.role_level,
      month: req.query.month,
      year: req.query.year,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getAdminOverview = async (req, res, next) => {
  try {
    const result = await reportsService.getAdminOverview();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getMyPerformance = async (req, res, next) => {
  try {
    const result = await reportsService.getMyPerformance({
      executiveId: req.user.id,
      roleLevel: req.user.role_level,
      month: req.query.month,
      year: req.query.year,
      self_only: req.query.self_only,
      filter_executive_id: req.query.filter_executive_id,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

module.exports = { getDailySummary, getMonthlySummary, getAdminOverview, getMyPerformance };