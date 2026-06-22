const payrollService = require('./payroll.service');
const { query } = require('../../config/database');

const getMyEmployeeId = async (userId) => {
  const result = await query('SELECT id FROM hr_employees WHERE user_id = $1', [userId]);
  return result.rows.length > 0 ? result.rows[0].id : null;
};

const getEmployeeComponents = async (req, res, next) => {
  try {
    const result = await payrollService.getEmployeeComponents(req.params.employeeId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const addComponent = async (req, res, next) => {
  try {
    const result = await payrollService.addComponent(req.params.employeeId, req.body);
    res.status(201).json({ success: true, data: result, message: 'যুক্ত হয়েছে' });
  } catch (err) { next(err); }
};

const removeComponent = async (req, res, next) => {
  try {
    await payrollService.removeComponent(req.params.id);
    res.json({ success: true, message: 'মুছে ফেলা হয়েছে' });
  } catch (err) { next(err); }
};

const getSettings = async (req, res, next) => {
  try {
    const result = await payrollService.getSettings();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const updateSettings = async (req, res, next) => {
  try {
    const result = await payrollService.updateSettings(req.body);
    res.json({ success: true, data: result, message: 'Settings আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const prepareMonth = async (req, res, next) => {
  try {
    const { month, year } = req.body;
    const result = await payrollService.prepareMonth(month, year);
    res.json({ success: true, data: result, message: `${result.length}টি payroll record প্রস্তুত হয়েছে` });
  } catch (err) { next(err); }
};

const updateDraftRun = async (req, res, next) => {
  try {
    const result = await payrollService.updateDraftRun(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const finalizeRun = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await payrollService.finalizeRun(req.params.id, employeeId);
    res.json({ success: true, data: result, message: 'Finalize হয়েছে ✅' });
  } catch (err) { next(err); }
};

const finalizeAllDrafts = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const { month, year } = req.body;
    const result = await payrollService.finalizeAllDrafts(month, year, employeeId);
    res.json({ success: true, data: result, message: `${result.length}টি payroll finalize হয়েছে ✅` });
  } catch (err) { next(err); }
};

const recordPayment = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await payrollService.recordPayment(req.params.id, req.body, employeeId, req.user.id);
    res.status(201).json({ success: true, data: result, message: 'পেমেন্ট রেকর্ড হয়েছে ✅' });
  } catch (err) { next(err); }
};

const getPayments = async (req, res, next) => {
  try {
    const result = await payrollService.getPayments(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const closeMonth = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const { month, year } = req.body;
    const result = await payrollService.closeMonth(month, year, employeeId, req.user.id);
    res.json({ success: true, data: result, message: `${result.closed_count}টি payroll close হয়েছে ✅` });
  } catch (err) { next(err); }
};

const getPayrollRuns = async (req, res, next) => {
  try {
    const result = await payrollService.getPayrollRuns(req.query.month, req.query.year);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const recalculateRun = async (req, res, next) => {
  try {
    const result = await payrollService.recalculateRun(req.params.id);
    res.json({ success: true, data: result, message: 'Recalculate হয়েছে ✅' });
  } catch (err) { next(err); }
};

module.exports = {
  getEmployeeComponents, addComponent, removeComponent,
  getSettings, updateSettings,
  prepareMonth, updateDraftRun,
  finalizeRun, finalizeAllDrafts,
  recordPayment, getPayments,
  closeMonth,
  getPayrollRuns, recalculateRun,
};