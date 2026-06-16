const express = require('express');
const router = express.Router();
const controller = require('./field-configs.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');

router.use(authenticate);
router.get('/', controller.getFieldConfigs);
router.patch('/:key', authorize('super_admin'), controller.updateFieldConfig);

module.exports = router;
