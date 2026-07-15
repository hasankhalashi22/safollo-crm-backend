const router = require('express').Router();
const { authenticate, authorizeModule } = require('../../middleware/authenticate');
const c = require('./academy.controller');

router.use(authenticate);

// Shorthand middleware
const anyRole   = authorizeModule('academy', ['viewer', 'editor', 'admin']); // all 3 roles
const editorUp  = authorizeModule('academy', ['editor', 'admin']);            // editor + admin
const adminOnly = authorizeModule('academy', ['admin']);                       // admin only
const superOnly = authorizeModule('academy', []);                              // super_admin only (no module role qualifies)

// Zoom Accounts
router.get('/zoom-accounts',        anyRole,   c.getZoomAccounts);
router.post('/zoom-accounts',       editorUp,  c.createZoomAccount);
router.put('/zoom-accounts/:id',    editorUp,  c.updateZoomAccount);
router.delete('/zoom-accounts/:id', adminOnly, c.deleteZoomAccount);

// Payment Rates — view all roles; edit/delete super_admin only
router.get('/payment-rates',                       anyRole,   c.getPaymentRates);
router.post('/payment-rates',                      superOnly, c.upsertPaymentRate);
router.delete('/payment-rates/:id',                superOnly, c.deletePaymentRate);
router.delete('/payment-rates/course/:courseType', superOnly, c.deleteCourseTypeRates);

// Teachers
router.get('/teachers',             anyRole,   c.getTeachers);
router.get('/teachers/:id',         anyRole,   c.getTeacher);
router.get('/teachers/:id/history', anyRole,   c.getTeacherHistory);
router.post('/teachers',            editorUp,  c.createTeacher);
router.put('/teachers/:id',         editorUp,  c.updateTeacher);
router.delete('/teachers/:id',      adminOnly, c.deleteTeacher);

// Courses — delete super_admin only
router.get('/courses',        anyRole,   c.getCourses);
router.post('/courses',       editorUp,  c.createCourse);
router.put('/courses/:id',    editorUp,  c.updateCourse);
router.delete('/courses/:id', superOnly, c.deleteCourse);

// Course Plans — delete super_admin only
router.get('/courses/:courseId/plans', anyRole,   c.getCoursePlans);
router.post('/courses/:courseId/plans', editorUp, c.createPlan);
router.put('/plans/:id',               editorUp,  c.updatePlan);
router.delete('/plans/:id',            superOnly, c.deletePlan);

// Plan Subjects — delete super_admin only
router.get('/plans/:planId/subjects',               anyRole,  c.getPlanSubjects);
router.post('/plans/:planId/subjects',              editorUp, c.createSubject);
router.post('/plans/:planId/subjects/import',       editorUp, c.importSubject);
router.post('/plans/:planId/import-subjects',       editorUp, c.importPlanSubjects);
router.put('/subjects/:id',                         editorUp, c.updateSubject);
router.delete('/subjects/:id',                      superOnly, c.deleteSubject);
router.put('/subjects/:subjectId/lectures',         editorUp, c.saveLectures);

// Excel import
router.post('/plans/:planId/import-excel',       editorUp, c.importPlanExcel);
router.post('/subjects/:subjectId/import-excel', editorUp, c.importSubjectExcel);

// Batches — delete super_admin only
router.get('/batches',        anyRole,   c.getBatches);
router.post('/batches',       editorUp,  c.createBatch);
router.put('/batches/:id',    editorUp,  c.updateBatch);
router.delete('/batches/:id', superOnly, c.deleteBatch);

// Batch Outline — individual row delete allowed for editor+; bulk clear super_admin only
router.get('/batches/:batchId/outline',         anyRole,   c.getBatchOutline);
router.post('/batches/:batchId/outline',        editorUp,  c.addOutlineRow);
router.post('/batches/:batchId/outline/bulk',   editorUp,  c.bulkAddOutlineRows);
router.put('/batches/:batchId/outline/reorder', editorUp,  c.reorderOutline);
router.delete('/batches/:batchId/outline',      superOnly, c.clearBatchOutline);
router.put('/outline/:id',                      editorUp,  c.updateOutlineRow);
router.delete('/outline/:id',                   editorUp,  c.deleteOutlineRow);

// Class Feedback
router.post('/outline/:outlineId/feedback', editorUp, c.submitFeedback);
router.get('/feedbacks/pending',            anyRole,  c.getPendingFeedbacks);
router.post('/feedbacks/:id/approve',       editorUp, c.approveFeedback);

// Teacher Payments — view all; create/edit editor+; delete super_admin only
router.get('/teacher-payment-summary',              anyRole,   c.getTeacherPaymentSummary);
router.get('/teacher-payment-details/:teacherId',   anyRole,   c.getTeacherPaymentDetails);
router.get('/teacher-payments',                     anyRole,   c.getTeacherPayments);
router.post('/teacher-payments/pay',                editorUp,  c.payTeacher);
router.post('/teacher-payments/recalculate',        editorUp,  c.recalculatePayments);
router.post('/teacher-payment-transactions',        editorUp,  c.createTeacherPaymentTransaction);

// Reports
router.get('/reports/schedule', anyRole, c.getScheduleReport);

// Academy Settings — admin only
router.get('/settings', adminOnly, c.getAcademySettings);
router.put('/settings', adminOnly, c.updateAcademySettings);

// Follow Batch — any authenticated user
router.post('/batches/:batchId/follow', c.followBatch);

module.exports = router;
