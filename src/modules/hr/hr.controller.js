const hrService = require('./hr.service');

const getEmployees = async (req, res, next) => {
  try {
    const result = await hrService.getEmployees();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getEmployeeById = async (req, res, next) => {
  try {
    const result = await hrService.getEmployeeById(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getUnlinkedCrmUsers = async (req, res, next) => {
  try {
    const result = await hrService.getUnlinkedCrmUsers();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createEmployee = async (req, res, next) => {
  try {
    const result = await hrService.createEmployee(req.body, req.user.id);
    res.status(201).json({ success: true, data: result, message: 'কর্মী যুক্ত হয়েছে' });
  } catch (err) { next(err); }
};

const updateEmployee = async (req, res, next) => {
  try {
    const result = await hrService.updateEmployee(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'তথ্য আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const deleteEmployee = async (req, res, next) => {
  try {
    await hrService.deleteEmployee(req.params.id);
    res.json({ success: true, message: 'কর্মী নিষ্ক্রিয় করা হয়েছে' });
  } catch (err) { next(err); }
};

const getPositions = async (req, res, next) => {
  try {
    const result = await hrService.getPositions();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createPosition = async (req, res, next) => {
  try {
    const result = await hrService.createPosition(req.body);
    res.status(201).json({ success: true, data: result, message: 'Position created' });
  } catch (err) { next(err); }
};

const updatePosition = async (req, res, next) => {
  try {
    const result = await hrService.updatePosition(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'Position updated' });
  } catch (err) { next(err); }
};

const deletePosition = async (req, res, next) => {
  try {
    await hrService.deletePosition(req.params.id);
    res.json({ success: true, message: 'Position deleted' });
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
  getEmployees, getEmployeeById, getUnlinkedCrmUsers, createEmployee, updateEmployee, deleteEmployee,
  getPositions, createPosition, updatePosition, deletePosition,
  getOrganogram,
  getNotices, createNotice, deleteNotice,
};