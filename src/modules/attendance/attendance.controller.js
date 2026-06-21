const attendanceService = require('./attendance.service');
const { query } = require('../../config/database');

const getMyEmployeeId = async (userId) => {
  const result = await query('SELECT id FROM hr_employees WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Employee record পাওয়া যায়নি' };
  return result.rows[0].id;
};

const getPolicy = async (req, res, next) => {
  try {
    const result = await attendanceService.getPolicy();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const updatePolicy = async (req, res, next) => {
  try {
    const result = await attendanceService.updatePolicy(req.body);
    res.json({ success: true, data: result, message: 'Policy আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const getBreakTypes = async (req, res, next) => {
  try {
    const result = await attendanceService.getBreakTypes();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const updateBreakType = async (req, res, next) => {
  try {
    const result = await attendanceService.updateBreakType(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const checkIn = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.checkIn(employeeId);
    res.json({ success: true, data: result, message: 'Check-in সফল হয়েছে ✅' });
  } catch (err) { next(err); }
};

const breakOut = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.breakOut(employeeId, req.body.break_type_id);
    res.json({ success: true, data: result, message: 'Break শুরু হয়েছে ✅' });
  } catch (err) { next(err); }
};

const breakIn = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.breakIn(employeeId, req.params.breakId);
    res.json({ success: true, data: result, message: 'Break শেষ হয়েছে ✅' });
  } catch (err) { next(err); }
};

const checkOut = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.checkOut(employeeId);
    res.json({ success: true, data: result, message: 'Check-out সফল হয়েছে ✅' });
  } catch (err) { next(err); }
};

const getMyTodayStatus = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.getTodayStatus(employeeId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getMyAttendance = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.getMyAttendance(employeeId, req.query.month, req.query.year);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getMyMonthlySummary = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.getMonthlySummary(employeeId, req.query.month, req.query.year);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getAllAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.getAllAttendance({
      date: req.query.date, dateFrom: req.query.dateFrom, dateTo: req.query.dateTo,
      employeeId: req.query.employeeId, status: req.query.status,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const requestWaiver = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.requestWaiver(employeeId, req.body);
    res.status(201).json({ success: true, data: result, message: 'Waiver আবেদন জমা হয়েছে ✅' });
  } catch (err) { next(err); }
};

const getWaivers = async (req, res, next) => {
  try {
    const result = await attendanceService.getWaivers(req.query.status);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const decideWaiver = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.decideWaiver(req.params.id, req.body.decision, employeeId);
    res.json({ success: true, data: result, message: 'প্রক্রিয়া সম্পন্ন হয়েছে ✅' });
  } catch (err) { next(err); }
};

module.exports = {
  getPolicy, updatePolicy, getBreakTypes, updateBreakType,
  checkIn, breakOut, breakIn, checkOut,
  getMyTodayStatus, getMyAttendance, getMyMonthlySummary, getAllAttendance,
  requestWaiver, getWaivers, decideWaiver,
};