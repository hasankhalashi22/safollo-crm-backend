const express = require('express');
const router = express.Router();
const { addPayment, cancelPayment, updatePayment } = require('./payments.controller');
const { authenticate } = require('../../middleware/authenticate');
const { uploadPayment } = require('../../config/cloudinary');

router.use(authenticate);
router.post('/', uploadPayment.single('payment_proof'), addPayment);
router.patch('/:id/amount', updatePayment);
router.delete('/:id', cancelPayment);

module.exports = router;