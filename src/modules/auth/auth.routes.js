const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');

// Public routes
router.post('/send-otp',          controller.sendOtp);
router.post('/verify-otp',        controller.verifyOtp);
router.post('/verify-otp-first',  controller.verifyOtpFirstLogin);
router.post('/set-password',      controller.setPassword);
router.post('/login',             controller.loginWithPassword);

// Protected routes
router.post('/logout',                      authenticate, controller.logout);
router.get('/me',                           authenticate, controller.getMe);
router.post('/change-password',             authenticate, controller.changePassword);
router.post('/reset-password/:userId',      authenticate, authorize('super_admin', 'advisor'), controller.resetPassword);

module.exports = router;