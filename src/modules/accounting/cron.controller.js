const settlementService = require('./settlement.service');

const runBkashSettlement = async (req, res, next) => {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(403).json({ success: false, message: 'Invalid secret' });
    }
    const result = await settlementService.runBkashSettlement();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const runRocketSettlement = async (req, res, next) => {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(403).json({ success: false, message: 'Invalid secret' });
    }
    const result = await settlementService.runRocketSettlement();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getSettings = async (req, res, next) => {
  try {
    const result = await settlementService.getSettings();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const updateSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const result = await settlementService.updateSetting(key, value);
    res.json({ success: true, data: result, message: 'Rate আপডেট হয়েছে ✅' });
  } catch (err) { next(err); }
};

module.exports = { runBkashSettlement, runRocketSettlement, getSettings, updateSetting };