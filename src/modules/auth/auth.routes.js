const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');

// Public
router.post('/login', controller.login);

// Protected
router.post('/logout',              authenticate, controller.logout);
router.get('/me',                   authenticate, controller.getMe);
router.post('/change-pin',          authenticate, controller.changePin);
router.post('/reset-pin/:userId',   authenticate, authorize('super_admin', 'advisor'), controller.resetPin);

module.exports = router;
