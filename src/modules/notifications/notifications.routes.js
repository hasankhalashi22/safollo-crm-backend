const express = require('express');
const router = express.Router();
const controller = require('./notifications.controller');
const { authenticate } = require('../../middleware/authenticate');

router.get('/vapid-key', controller.getVapidKey);
router.post('/subscribe', authenticate, controller.subscribe);

module.exports = router;