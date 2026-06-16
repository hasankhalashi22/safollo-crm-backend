const express = require('express');
const router = express.Router();
const hrController = require('./hr.controller');
const { authenticate } = require('../../middleware/authenticate');

router.use(authenticate);

router.get('/employees', hrController.getEmployees);
router.patch('/employees/:userId', hrController.upsertEmployeeDetails);
router.get('/organogram', hrController.getOrganogram);
router.get('/positions', hrController.getPositions);
router.post('/positions', hrController.createPosition);
router.patch('/positions/:id', hrController.updatePosition);
router.delete('/positions/:id', hrController.deletePosition);

router.get('/notices', hrController.getNotices);
router.post('/notices', hrController.createNotice);
router.delete('/notices/:id', hrController.deleteNotice);

module.exports = router;