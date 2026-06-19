const leaveService = require('./leave.service');

const getLeaveTypes = async (req, res, next) => {
  try {
    const result = await leaveService.getLeaveTypes();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createLeaveType = async (req, res, next) => {
  try {
    const result = await leaveService.createLeaveType(req.body);
    res.status(201).json({ success: true, data: result, message: 'Leave type তৈরি হয়েছে' });
  } catch (err) { next(err); }
};

const updateLeaveType = async (req, res, next) => {
  try {
    const result = await leaveService.updateLeaveType(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const getLeavePolicy = async (req, res, next) => {
  try {
    const result = await leaveService.getLeavePolicy();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const updateLeavePolicy = async (req, res, next) => {
  try {
    const result = await leaveService.updateLeavePolicy(req.body);
    res.json({ success: true, data: result, message: 'Policy আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const getMyBalances = async (req, res, next) => {
  try {
    const empResult = await require('../../../config/database').query(
      'SELECT id FROM hr_employees WHERE user_id = $1', [req.user.id]
    );
    if (empResult.rows.length === 0) return res.json({ success: true, data: [] });
    const result = await leaveService.getEmployeeBalances(empResult.rows[0].id, req.query.year);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getEmployeeBalances = async (req, res, next) => {
  try {
    const result = await leaveService.getEmployeeBalances(req.params.employeeId, req.query.year);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const applyLeave = async (req, res, next) => {
  try {
    const { query } = require('../../config/database');
    const empResult = await query('SELECT id FROM hr_employees WHERE user_id = $1', [req.user.id]);
    if (empResult.rows.length === 0) throw { statusCode: 404, message: 'Employee record পাওয়া যায়নি' };
    const result = await leaveService.applyLeave(empResult.rows[0].id, req.body);
    res.status(201).json({ success: true, data: result, message: 'Leave আবেদন জমা হয়েছে ✅' });
  } catch (err) { next(err); }
};

const getMyApplications = async (req, res, next) => {
  try {
    const { query } = require('../../config/database');
    const empResult = await query('SELECT id FROM hr_employees WHERE user_id = $1', [req.user.id]);
    if (empResult.rows.length === 0) return res.json({ success: true, data: [] });
    const result = await leaveService.getApplications({ employeeId: empResult.rows[0].id, year: req.query.year });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getAllApplications = async (req, res, next) => {
  try {
    const result = await leaveService.getApplications({ status: req.query.status, year: req.query.year });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const processApplication = async (req, res, next) => {
  try {
    const { query } = require('../../config/database');
    const empResult = await query('SELECT id FROM hr_employees WHERE user_id = $1', [req.user.id]);
    if (empResult.rows.length === 0) throw { statusCode: 404, message: 'Employee record পাওয়া যায়নি' };
    const result = await leaveService.processApplication(
      req.params.id, req.body.action, empResult.rows[0].id, req.body
    );
    res.json({ success: true, data: result, message: 'আবেদন প্রক্রিয়া হয়েছে ✅' });
  } catch (err) { next(err); }
};

const getLeaveRegister = async (req, res, next) => {
  try {
    const result = await leaveService.getLeaveRegister(req.query.year);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};


module.exports = {
  getLeaveTypes, createLeaveType, updateLeaveType,
  getLeavePolicy, updateLeavePolicy,
  getMyBalances, getEmployeeBalances, getLeaveRegister,
  applyLeave, getMyApplications, getAllApplications,
  processApplication,
};