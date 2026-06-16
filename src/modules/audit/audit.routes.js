const express = require('express');
const router = express.Router();
const controller = require('./audit.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');

router.use(authenticate);
router.get('/', authorize('super_admin'), controller.getLogs);

module.exports = router;