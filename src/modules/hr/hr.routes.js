const express = require('express');
const router = express.Router();
const hrController = require('./hr.controller');
const { authenticate, authorizeModule } = require('../../middleware/authenticate');
const { uploadProfile, uploadNid, uploadSignature, uploadNotice } = require('../../config/cloudinary');

router.use(authenticate);

// Notice board read — open to everyone logged in (ESS included), not gated by HR module access
router.get('/notices', hrController.getNotices);
router.get('/dashboard-stats', hrController.getDashboardStats);

// hr_advisor ও hr_manager উভয়ের জন্য — viewer শুধু GET
router.use(authorizeModule('hr'));

router.get('/employees', hrController.getEmployees);
router.get('/employees/history', hrController.getEmployeeHistory);
router.get('/employees/unlinked-crm-users', authorizeModule('hr', ['hr_manager', 'hr_advisor']), hrController.getUnlinkedCrmUsers);
router.get('/employees/:id', hrController.getEmployeeById);
router.post('/employees', authorizeModule('hr', ['hr_manager', 'hr_advisor']), hrController.createEmployee);
router.patch('/employees/:id', authorizeModule('hr', ['hr_manager', 'hr_advisor']), hrController.updateEmployee);
router.delete('/employees/:id', hrController.deleteEmployee); // super_admin only — handled in controller
router.get('/employees/:id/module-access', hrController.getEmployeeModuleAccess);
router.put('/employees/:id/module-access', authorizeModule('hr', ['hr_advisor']), hrController.setEmployeeModuleAccess);
router.post('/sync-profiles', hrController.syncProfiles);
router.post('/employees/:id/link-ess', authorizeModule('hr', ['hr_manager', 'hr_advisor']), hrController.linkEssUser);
router.delete('/employees/:id/link-ess', authorizeModule('hr', ['hr_manager', 'hr_advisor']), hrController.unlinkEssUser);
router.post('/employees/:id/create-ess-login', authorizeModule('hr', ['hr_manager', 'hr_advisor']), hrController.createEssLogin);

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

router.post('/notices', uploadNotice.single('attachment'), hrController.createNotice);
router.delete('/notices/:id', hrController.deleteNotice);



module.exports = router;