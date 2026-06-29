const express = require('express');
const router = express.Router();
const hrController = require('./hr.controller');
const { authenticate, authorizeModule } = require('../../middleware/authenticate');
const { uploadProfile, uploadNid, uploadSignature } = require('../../config/cloudinary');

router.use(authenticate);
router.use(authorizeModule('hr'));

router.get('/employees', hrController.getEmployees);
router.get('/employees/unlinked-crm-users', hrController.getUnlinkedCrmUsers);
router.get('/employees/:id', hrController.getEmployeeById);
router.post('/employees', hrController.createEmployee);
router.patch('/employees/:id', hrController.updateEmployee);
router.delete('/employees/:id', hrController.deleteEmployee);
router.get('/employees/:id/module-access', hrController.getEmployeeModuleAccess);
router.put('/employees/:id/module-access', hrController.setEmployeeModuleAccess);
router.post('/sync-profiles', hrController.syncProfiles);
router.post('/employees/:id/link-ess', hrController.linkEssUser);
router.delete('/employees/:id/link-ess', hrController.unlinkEssUser);
router.post('/employees/:id/create-ess-login', hrController.createEssLogin);

router.post('/employees/:id/photo', uploadProfile.single('photo'), hrController.uploadPhoto);
router.post('/employees/:id/nid', uploadNid.single('nid'), hrController.uploadNid);
router.post('/employees/:id/signature', uploadSignature.single('signature'), hrController.uploadSignature);

router.get('/positions', hrController.getPositions);
router.post('/positions', hrController.createPosition);
router.patch('/positions/:id', hrController.updatePosition);
router.delete('/positions/:id', hrController.deletePosition);

router.get('/organogram', hrController.getOrganogram);
router.get('/holidays', hrController.getHolidays);
router.post('/holidays', hrController.createHoliday);
router.delete('/holidays/:id', hrController.deleteHoliday);

router.get('/notices', hrController.getNotices);
router.post('/notices', hrController.createNotice);
router.delete('/notices/:id', hrController.deleteNotice);



module.exports = router;