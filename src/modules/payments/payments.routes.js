const express = require('express');
const router = express.Router();
const { addPayment, cancelPayment, updatePayment, updateMethod, updateDetails, adminDeletePayment } = require('./payments.controller');
const { authenticate } = require('../../middleware/authenticate');
const { uploadPayment } = require('../../config/cloudinary');

router.use(authenticate);
router.post('/', uploadPayment.single('payment_proof'), addPayment);
router.patch('/:id/amount', updatePayment);
router.patch('/:id/method', updateMethod);
router.patch('/:id/details', updateDetails);
router.delete('/:id/admin', adminDeletePayment);
router.delete('/:id', cancelPayment);

module.exports = router;