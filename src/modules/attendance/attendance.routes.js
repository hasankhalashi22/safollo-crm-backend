const express = require('express');
const router = express.Router();
const attendanceController = require('./attendance.controller');
const { authenticate, authorizeModule } = require('../../middleware/authenticate');

router.use(authenticate);

router.get('/policy', attendanceController.getPolicy);
router.patch('/policy', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.updatePolicy);
router.get('/break-types', attendanceController.getBreakTypes);
router.patch('/break-types/:id', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.updateBreakType);

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

router.get('/device/unmapped-punches', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.getUnmappedPunches);
router.get('/device/mappings', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.getDeviceMappings);
router.post('/device/mappings', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.assignDeviceMapping);
router.delete('/device/mappings/:employeeId', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.clearDeviceMapping);
router.get('/device/punches', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.getRecentPunches);
router.get('/device/registry', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.getDevices);
router.post('/device/registry', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.registerDevice);
router.patch('/device/registry/:id', authorizeModule('hr', ['hr_advisor', 'admin']), attendanceController.updateDevice);

module.exports = router;