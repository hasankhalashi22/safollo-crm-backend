const express = require('express');
const router = express.Router();
const leaveController = require('./leave.controller');
const { authenticate } = require('../../middleware/authenticate');

router.use(authenticate);

// Leave types (HR admin)
router.get('/types', leaveController.getLeaveTypes);
router.post('/types', leaveController.createLeaveType);
router.patch('/types/:id', leaveController.updateLeaveType);

// Leave policy (HR admin)
router.get('/policy', leaveController.getLeavePolicy);
router.patch('/policy', leaveController.updateLeavePolicy);

// Employee self-service (my own)
router.get('/my/balances', leaveController.getMyBalances);
router.get('/my/applications', leaveController.getMyApplications);
router.post('/my/apply', leaveController.applyLeave);

// HR admin — all applications
router.get('/applications', leaveController.getAllApplications);
router.get('/employees/:employeeId/balances', leaveController.getEmployeeBalances);

// Process application (check/consent/approval)
router.patch('/applications/:id/process', leaveController.processApplication);

module.exports = router;