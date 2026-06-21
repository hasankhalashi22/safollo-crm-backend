const express = require('express');
const router = express.Router();
const attendanceController = require('./attendance.controller');
const { authenticate } = require('../../middleware/authenticate');

router.use(authenticate);

router.get('/policy', attendanceController.getPolicy);
router.patch('/policy', attendanceController.updatePolicy);
router.get('/break-types', attendanceController.getBreakTypes);
router.patch('/break-types/:id', attendanceController.updateBreakType);

router.post('/check-in', attendanceController.checkIn);
router.post('/break-out', attendanceController.breakOut);
router.patch('/break-in/:breakId', attendanceController.breakIn);
router.post('/check-out', attendanceController.checkOut);

router.get('/my/today', attendanceController.getMyTodayStatus);
router.get('/my/history', attendanceController.getMyAttendance);
router.get('/my/summary', attendanceController.getMyMonthlySummary);

router.post('/waivers', attendanceController.requestWaiver);
router.get('/waivers', attendanceController.getWaivers);
router.patch('/waivers/:id/decide', attendanceController.decideWaiver);

router.get('/all', attendanceController.getAllAttendance);

module.exports = router;