const attendanceService = require('./attendance.service');
const { query } = require('../../config/database');

const getMyEmployeeId = async (userId) => {
  const result = await query('SELECT id FROM hr_employees WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Employee record পাওয়া যায়নি' };
  return result.rows[0].id;
};

const checkIn = async (req, res, next) => {
  try {
    const employeeId = await getMyEmployeeId(req.user.id);
    const result = await attendanceService.checkIn(employeeId);
    res.json({ success: true, data: result, message: 'Check-in সফল হয়েছে ✅' });
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
      date: req.query.date,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      employeeId: req.query.employeeId,
      status: req.query.status,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

module.exports = {
  checkIn, checkOut, getMyTodayStatus, getMyAttendance, getMyMonthlySummary, getAllAttendance,
};