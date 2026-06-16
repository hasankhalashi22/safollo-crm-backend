const service = require('./field-configs.service');

const getFieldConfigs = async (req, res, next) => {
  try {
    const result = await service.getFieldConfigs();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const updateFieldConfig = async (req, res, next) => {
  try {
    const result = await service.updateFieldConfig(req.params.key, req.body, req.user.id);
    res.json({ success: true, data: result, message: 'Field config আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

module.exports = { getFieldConfigs, updateFieldConfig };
