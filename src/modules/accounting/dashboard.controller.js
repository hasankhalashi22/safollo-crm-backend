const dashboardService = require('./dashboard.service');

const getDashboard = async (req, res, next) => {
  try {
    const result = await dashboardService.getDashboard();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

module.exports = { getDashboard };