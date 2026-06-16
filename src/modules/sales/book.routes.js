const express = require('express');
const router = express.Router();
const bookController = require('./book.controller');
const { authenticate } = require('../../middleware/authenticate');

router.use(authenticate);

router.post('/delivered', bookController.confirmDelivery);
router.post('/returned', bookController.markReturned);

module.exports = router;