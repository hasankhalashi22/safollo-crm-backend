const payrollService = require('./payroll.service');
const { query } = require('../../config/database');

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

const generatePayroll = async (req, res, next) => {
  try {
    const { month, year } = req.body;
    const result = await payrollService.generatePayrollForMonth(month, year);
    res.json({ success: true, data: result, message: `${result.length}টি payroll record তৈরি হয়েছে` });
  } catch (err) { next(err); }
};

const getPayrollRuns = async (req, res, next) => {
  try {
    const result = await payrollService.getPayrollRuns(req.query.month, req.query.year);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const approvePayrollRun = async (req, res, next) => {
  try {
    const empResult = await query('SELECT id FROM hr_employees WHERE user_id = $1', [req.user.id]);
    const approverId = empResult.rows.length > 0 ? empResult.rows[0].id : null;
    const result = await payrollService.approvePayrollRun(req.params.id, approverId, req.user.id);
    res.json({ success: true, data: result, message: 'Payroll অনুমোদিত ও Accounting-এ যুক্ত হয়েছে ✅' });
  } catch (err) { next(err); }
};

module.exports = {
  getEmployeeComponents, addComponent, removeComponent,
  getSettings, updateSettings,
  generatePayroll, getPayrollRuns, approvePayrollRun,
};