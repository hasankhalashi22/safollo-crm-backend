const express = require('express');
const router = express.Router();
const leaveController = require('./leave.controller');
const { authenticate, authorizeModule } = require('../../middleware/authenticate');

router.use(authenticate);

// Leave types (HR admin)
router.get('/types', leaveController.getLeaveTypes);
router.post('/types', authorizeModule('hr', ['hr_advisor', 'admin']), leaveController.createLeaveType);
router.patch('/types/:id', authorizeModule('hr', ['hr_advisor', 'admin']), leaveController.updateLeaveType);
router.delete('/types/:id', authorizeModule('hr', ['hr_advisor', 'admin']), leaveController.deleteLeaveType);

// Leave policy (HR admin)
router.get('/policy', leaveController.getLeavePolicy);
router.patch('/policy', authorizeModule('hr', ['hr_advisor', 'admin']), leaveController.updateLeavePolicy);

// Employee self-service (my own)
router.get('/my/balances', leaveController.getMyBalances);
router.get('/my/applications', leaveController.getMyApplications);
router.post('/my/apply', leaveController.applyLeave);
router.get('/my/approval-queue', leaveController.getMyApprovalQueue);
router.get('/my/is-approver', leaveController.checkIsApprover);

// HR admin — all applications
router.get('/applications', leaveController.getAllApplications);
router.get('/employees/:employeeId/balances', leaveController.getEmployeeBalances);
router.get('/employees/:employeeId/residential-credits', leaveController.getResidentialLeaveCredits);
router.get('/employees/:employeeId/applications', leaveController.getEmployeeApplications);
router.get('/register', leaveController.getLeaveRegister);

// Process application (check/consent/approval)
router.patch('/applications/:id/process', leaveController.processApplication);

module.exports = router;