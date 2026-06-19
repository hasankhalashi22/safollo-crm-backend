const express = require('express');
const router = express.Router();
const attendanceController = require('./attendance.controller');
const { authenticate } = require('../../middleware/authenticate');

router.use(authenticate);

router.post('/check-in', attendanceController.checkIn);
router.post('/check-out', attendanceController.checkOut);
router.get('/my/today', attendanceController.getMyTodayStatus);
router.get('/my/history', attendanceController.getMyAttendance);
router.get('/my/summary', attendanceController.getMyMonthlySummary);
router.get('/all', attendanceController.getAllAttendance);

module.exports = router;