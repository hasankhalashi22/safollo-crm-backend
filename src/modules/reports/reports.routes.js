const express = require('express');
const router = express.Router();
const controller = require('./reports.controller');
const { authenticate, authorizeLevel } = require('../../middleware/authenticate');

router.use(authenticate);
router.get('/daily',    controller.getDailySummary);
router.get('/monthly',  controller.getMonthlySummary);
router.get('/overview', authorizeLevel(3), controller.getAdminOverview);
router.get('/my-performance', controller.getMyPerformance);
module.exports = router;
