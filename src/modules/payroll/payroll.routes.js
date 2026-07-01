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
router.patch('/settings', authorizeModule('hr', ['hr_advisor']), payrollController.updateSettings);

router.post('/prepare', payrollController.prepareMonth);
router.patch('/runs/:id', payrollController.updateDraftRun);
router.patch('/runs/:id/recalculate', payrollController.recalculateRun);
router.patch('/runs/:id/finalize', payrollController.finalizeRun);
router.post('/finalize-all', payrollController.finalizeAllDrafts);

router.post('/runs/:id/payments', payrollController.recordPayment);
router.get('/runs/:id/payments', payrollController.getPayments);
router.patch('/payments/:paymentId', payrollController.updatePayment);
router.delete('/payments/:paymentId', payrollController.deletePayment);

router.post('/close', payrollController.closeMonth);

router.get('/runs', payrollController.getPayrollRuns);

module.exports = router;