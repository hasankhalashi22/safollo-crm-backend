const express = require('express');
const router = express.Router();
const controller = require('./sales.controller');
const { authenticate, authorize, hasPermission } = require('../../middleware/authenticate');
const { uploadPayment } = require('../../config/cloudinary');

router.use(authenticate);

router.post('/',               hasPermission('create_sale'), uploadPayment.single('payment_proof'), controller.createSale);
router.get('/due',             hasPermission('view_due'), controller.getDueList);
router.get('/revenue',         hasPermission('view_sales'), controller.getRevenue);
router.get('/',                hasPermission('view_sales'), controller.getSales);
router.get('/:id',             hasPermission('view_sales'), controller.getSaleById);
router.patch('/:id',           authorize('super_admin', 'advisor'), controller.editSale);
router.patch('/:id/reassign',  hasPermission('reassign_due'), controller.reassignDue);
router.delete('/:id',          controller.deleteSale);

module.exports = router;