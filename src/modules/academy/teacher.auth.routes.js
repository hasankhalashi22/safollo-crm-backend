const router = require('express').Router();
const { authenticate } = require('../../middleware/authenticate');
const c = require('./teacher.auth.controller');

// ── Public (no auth) ──────────────────────────────────────────────────────────
router.post('/register', c.register);
router.post('/login',    c.login);

// ── Teacher protected ─────────────────────────────────────────────────────────
router.get('/me',          c.authenticateTeacher, c.getMyProfile);
router.put('/me',          c.authenticateTeacher, c.updateMyProfile);
router.get('/courses',     c.authenticateTeacher, c.getCoursesWithSubjects);
router.get('/classes',     c.authenticateTeacher, c.getMyClasses);
router.get('/payments',    c.authenticateTeacher, c.getMyPayments);
router.post('/outline/:outlineId/feedback', c.authenticateTeacher, c.submitFeedback);

// ── Admin: manage teacher accounts ───────────────────────────────────────────
router.get('/pending',                     authenticate, c.getPendingTeachers);
router.post('/:id/approve',                authenticate, c.approveTeacher);
router.post('/:id/reset-password',         authenticate, c.resetTeacherPassword);

module.exports = router;
