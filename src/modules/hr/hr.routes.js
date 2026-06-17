const express = require('express');
const router = express.Router();
const hrController = require('./hr.controller');
const { authenticate } = require('../../middleware/authenticate');

router.use(authenticate);

router.get('/employees', hrController.getEmployees);
router.get('/employees/unlinked-crm-users', hrController.getUnlinkedCrmUsers);
router.get('/employees/:id', hrController.getEmployeeById);
router.post('/employees', hrController.createEmployee);
router.patch('/employees/:id', hrController.updateEmployee);
router.delete('/employees/:id', hrController.deleteEmployee);

router.get('/positions', hrController.getPositions);
router.post('/positions', hrController.createPosition);
router.patch('/positions/:id', hrController.updatePosition);
router.delete('/positions/:id', hrController.deletePosition);

router.get('/organogram', hrController.getOrganogram);

router.get('/notices', hrController.getNotices);
router.post('/notices', hrController.createNotice);
router.delete('/notices/:id', hrController.deleteNotice);

module.exports = router;