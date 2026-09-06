const express = require('express');
const router = express.Router();
const controller = require('./approvals.controller');
const { authenticate, authorizeLevel } = require('../../middleware/authenticate');

router.use(authenticate);

router.get('/',                          authorizeLevel(3), controller.getPendingApprovals);
router.get('/due-payments',              authorizeLevel(3), controller.getPendingDuePayments);
router.get('/my-pending',                controller.getMyPendingList);
router.get('/my-pending-due',            controller.getMyPendingDue);
router.patch('/:id/approve',             authorizeLevel(3), controller.approveSale);
router.patch('/:id/reject',              authorizeLevel(3), controller.rejectSale);
router.patch('/:id/resubmit',            controller.resubmitSale);
router.delete('/:id/cancel',             authorizeLevel(2), controller.cancelPendingSale);
router.patch('/payments/:id/approve',    authorizeLevel(3), controller.approveDuePayment);
router.patch('/payments/:id/reject',     authorizeLevel(3), controller.rejectDuePayment);
router.patch('/payments/:id/resubmit',   controller.resubmitDuePayment);
router.delete('/payments/:id/cancel',    authorizeLevel(2), controller.cancelPendingDuePayment);

module.exports = router;