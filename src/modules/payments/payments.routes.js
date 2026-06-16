const express = require('express');
const router = express.Router();
const { addPayment, cancelPayment } = require('./payments.controller');
const { authenticate } = require('../../middleware/authenticate');
const { uploadPayment } = require('../../config/cloudinary');

router.use(authenticate);
router.post('/', uploadPayment.single('payment_proof'), addPayment);
router.delete('/:id', cancelPayment);

module.exports = router;