const hrService = require('./hr.service');

const getEmployees = async (req, res, next) => {
  try {
    const result = await hrService.getEmployees();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const upsertEmployeeDetails = async (req, res, next) => {
  try {
    const result = await hrService.upsertEmployeeDetails(req.params.userId, req.body);
    res.json({ success: true, data: result, message: 'Employee details updated' });
  } catch (err) { next(err); }
};

const getOrganogram = async (req, res, next) => {
  try {
    const result = await hrService.getOrganogram();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getNotices = async (req, res, next) => {
  try {
    const result = await hrService.getNotices();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createNotice = async (req, res, next) => {
  try {
    const result = await hrService.createNotice(req.body, req.user.id);
    res.status(201).json({ success: true, data: result, message: 'Notice posted' });
  } catch (err) { next(err); }
};

const deleteNotice = async (req, res, next) => {
  try {
    await hrService.deleteNotice(req.params.id);
    res.json({ success: true, message: 'Notice deleted' });
  } catch (err) { next(err); }
};

module.exports = {
  getEmployees, upsertEmployeeDetails, getOrganogram,
  getNotices, createNotice, deleteNotice,
};