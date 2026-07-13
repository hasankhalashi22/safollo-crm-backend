const router = require('express').Router();
const { authenticate } = require('../../middleware/authenticate');
const c = require('./academy.controller');

router.use(authenticate);

// Zoom Accounts
router.get('/zoom-accounts', c.getZoomAccounts);
router.post('/zoom-accounts', c.createZoomAccount);
router.put('/zoom-accounts/:id', c.updateZoomAccount);
router.delete('/zoom-accounts/:id', c.deleteZoomAccount);

// Payment Rates
router.get('/payment-rates', c.getPaymentRates);
router.post('/payment-rates', c.upsertPaymentRate);
router.delete('/payment-rates/:id', c.deletePaymentRate);
router.delete('/payment-rates/course/:courseType', c.deleteCourseTypeRates);

// Teachers
router.get('/teachers', c.getTeachers);
router.get('/teachers/:id', c.getTeacher);
router.get('/teachers/:id/history', c.getTeacherHistory);
router.post('/teachers', c.createTeacher);
router.put('/teachers/:id', c.updateTeacher);
router.delete('/teachers/:id', c.deleteTeacher);

// Courses
router.get('/courses', c.getCourses);
router.post('/courses', c.createCourse);
router.put('/courses/:id', c.updateCourse);
router.delete('/courses/:id', c.deleteCourse);

// Course Plans
router.get('/courses/:courseId/plans', c.getCoursePlans);
router.post('/courses/:courseId/plans', c.createPlan);
router.put('/plans/:id', c.updatePlan);
router.delete('/plans/:id', c.deletePlan);

// Plan Subjects
router.get('/plans/:planId/subjects', c.getPlanSubjects);
router.post('/plans/:planId/subjects', c.createSubject);
router.post('/plans/:planId/subjects/import', c.importSubject);
router.put('/subjects/:id', c.updateSubject);
router.delete('/subjects/:id', c.deleteSubject);
router.put('/subjects/:subjectId/lectures', c.saveLectures);

// Excel import
router.post('/plans/:planId/import-excel', c.importPlanExcel);
router.post('/subjects/:subjectId/import-excel', c.importSubjectExcel);

// Batches
router.get('/batches', c.getBatches);
router.post('/batches', c.createBatch);
router.put('/batches/:id', c.updateBatch);
router.delete('/batches/:id', c.deleteBatch);

// Batch Outline
router.get('/batches/:batchId/outline', c.getBatchOutline);
router.post('/batches/:batchId/outline', c.addOutlineRow);
router.post('/batches/:batchId/outline/bulk', c.bulkAddOutlineRows);
router.put('/batches/:batchId/outline/reorder', c.reorderOutline);
router.put('/outline/:id', c.updateOutlineRow);
router.delete('/outline/:id', c.deleteOutlineRow);

// Class Feedback
router.post('/outline/:outlineId/feedback', c.submitFeedback);
router.get('/feedbacks/pending', c.getPendingFeedbacks);
router.post('/feedbacks/:id/approve', c.approveFeedback);

// Teacher Payments
router.get('/teacher-payment-summary', c.getTeacherPaymentSummary);
router.get('/teacher-payment-details/:teacherId', c.getTeacherPaymentDetails);
router.get('/teacher-payments', c.getTeacherPayments);
router.post('/teacher-payments/pay', c.payTeacher);
router.post('/teacher-payments/recalculate', c.recalculatePayments);
router.post('/teacher-payment-transactions', c.createTeacherPaymentTransaction);

// Reports
router.get('/reports/schedule', c.getScheduleReport);

// Academy Settings
router.get('/settings', c.getAcademySettings);
router.put('/settings', c.updateAcademySettings);

module.exports = router;
