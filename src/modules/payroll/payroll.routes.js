const express = require('express');
const router = express.Router();
const payrollController = require('./payroll.controller');
const { authenticate, authorizeModule } = require('../../middleware/authenticate');

router.use(authenticate);
router.use(authorizeModule('hr'));

router.get('/employees/:employeeId/components', payrollController.getEmployeeComponents);
router.post('/employees/:employeeId/components', payrollController.addComponent);
router.delete('/components/:id', payrollController.removeComponent);

router.get('/settings', payrollController.getSettings);
router.patch('/settings', payrollController.updateSettings);

router.post('/generate', payrollController.generatePayroll);
router.get('/runs', payrollController.getPayrollRuns);
router.patch('/runs/:id/approve', payrollController.approvePayrollRun);

module.exports = router;