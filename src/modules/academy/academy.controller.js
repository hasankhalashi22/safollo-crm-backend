const svc = require('./academy.service');

const wrap = (fn) => async (req, res, next) => { try { const data = await fn(req, res); res.json({ success: true, data }); } catch (err) { next(err); } };
const superAdminOnly = (req) => { if (req.user.role !== 'super_admin') throw { statusCode: 403, message: 'শুধু super admin এটা করতে পারবেন' }; };

// Zoom Accounts
exports.getZoomAccounts   = wrap(async (req) => svc.getZoomAccounts());
exports.createZoomAccount = wrap(async (req) => svc.createZoomAccount(req.body));
exports.updateZoomAccount = wrap(async (req) => svc.updateZoomAccount(req.params.id, req.body));
exports.deleteZoomAccount = wrap(async (req) => svc.deleteZoomAccount(req.params.id));

// Payment Rates — upsert/delete restricted to super_admin only (superOnly route)
exports.getPaymentRates        = wrap(async (req) => svc.getPaymentRates());
exports.upsertPaymentRate      = wrap(async (req) => { superAdminOnly(req); return svc.upsertPaymentRate(req.body); });
exports.deletePaymentRate      = wrap(async (req) => { superAdminOnly(req); return svc.deletePaymentRate(req.params.id); });
exports.deleteCourseTypeRates  = wrap(async (req) => { superAdminOnly(req); return svc.deleteCourseTypeRates(req.params.courseType); });

// Teachers
exports.getTeachers       = wrap(async (req) => svc.getTeachers());
exports.getTeacher        = wrap(async (req) => svc.getTeacher(req.params.id));
exports.createTeacher     = wrap(async (req) => svc.createTeacher(req.body));
exports.updateTeacher     = wrap(async (req) => svc.updateTeacher(req.params.id, req.body));
exports.deleteTeacher     = wrap(async (req) => svc.deleteTeacher(req.params.id));
exports.getTeacherHistory = wrap(async (req) => svc.getTeacherHistory(req.params.id));

// Courses — delete restricted to super_admin only (superOnly route)
exports.getCourses   = wrap(async (req) => svc.getCourses());
exports.createCourse = wrap(async (req) => svc.createCourse(req.body));
exports.updateCourse = wrap(async (req) => svc.updateCourse(req.params.id, req.body));
exports.deleteCourse = wrap(async (req) => { superAdminOnly(req); return svc.deleteCourse(req.params.id); });

// Course Plans — delete restricted to super_admin only (superOnly route)
exports.getCoursePlans = wrap(async (req) => svc.getCoursePlans(req.params.courseId));
exports.createPlan     = wrap(async (req) => svc.createPlan(req.params.courseId, req.body));
exports.updatePlan     = wrap(async (req) => svc.updatePlan(req.params.id, req.body));
exports.deletePlan     = wrap(async (req) => { superAdminOnly(req); return svc.deletePlan(req.params.id); });

// Plan Subjects — delete restricted to super_admin only (superOnly route)
exports.getPlanSubjects    = wrap(async (req) => svc.getPlanSubjects(req.params.planId));
exports.createSubject      = wrap(async (req) => svc.createSubject(req.params.planId, req.body));
exports.updateSubject      = wrap(async (req) => svc.updateSubject(req.params.id, req.body));
exports.deleteSubject      = wrap(async (req) => { superAdminOnly(req); return svc.deleteSubject(req.params.id); });
exports.importSubject      = wrap(async (req) => svc.importSubject(req.params.planId, req.body.source_subject_id));
exports.importPlanSubjects = wrap(async (req) => svc.importPlanSubjects(req.params.planId, req.body.source_plan_id));
exports.saveLectures       = wrap(async (req) => svc.saveLectures(req.params.subjectId, req.body.lectures));

// Batches — delete restricted to super_admin only (superOnly route)
exports.getBatches   = wrap(async (req) => svc.getBatches());
exports.createBatch  = wrap(async (req) => svc.createBatch(req.body));
exports.updateBatch  = wrap(async (req) => svc.updateBatch(req.params.id, req.body));
exports.deleteBatch  = wrap(async (req) => { superAdminOnly(req); return svc.deleteBatch(req.params.id); });

// Batch Outline — clearBatchOutline restricted to super_admin only (superOnly route)
exports.getBatchOutline    = wrap(async (req) => svc.getBatchOutline(req.params.batchId));
exports.addOutlineRow      = wrap(async (req) => svc.addOutlineRow(req.params.batchId, req.body, req.user.id));
exports.bulkAddOutlineRows = wrap(async (req) => svc.bulkAddOutlineRows(req.params.batchId, req.body.rows));
exports.updateOutlineRow   = wrap(async (req) => svc.updateOutlineRow(req.params.id, req.body, req.user.id));
exports.deleteOutlineRow   = wrap(async (req) => svc.deleteOutlineRow(req.params.id));
exports.reorderOutline     = wrap(async (req) => svc.reorderOutline(req.params.batchId, req.body.ordered_ids));
exports.clearBatchOutline  = wrap(async (req) => { superAdminOnly(req); return svc.clearBatchOutline(req.params.batchId); });

// Feedback
exports.submitFeedback      = wrap(async (req) => svc.submitFeedback(req.params.outlineId, req.body.teacher_id, req.body.note));
exports.getPendingFeedbacks = wrap(async (req) => svc.getPendingFeedbacks());
exports.approveFeedback     = wrap(async (req) => svc.approveFeedback(req.params.id, req.user.id, req.body.approved));

// Teacher Payments
exports.getTeacherPaymentSummary        = wrap(async (req) => svc.getTeacherPaymentSummary());
exports.getTeacherPaymentDetails        = wrap(async (req) => svc.getTeacherPaymentDetails(req.params.teacherId));
exports.getTeacherPayments              = wrap(async (req) => svc.getTeacherPayments(req.query.teacher_id || null));
exports.payTeacher                      = wrap(async (req) => svc.payTeacher({ ...req.body, paid_by: req.user.id }));
exports.recalculatePayments             = wrap(async (req) => svc.recalculatePayments());
exports.createTeacherPaymentTransaction = wrap(async (req) => svc.createTeacherPaymentTransaction({ ...req.body, created_by: req.user.id }));

// Reports
exports.getScheduleReport = wrap(async (req) => svc.getScheduleReport(req.query));

// Academy Settings
exports.getAcademySettings    = wrap(async (req) => svc.getAcademySettings());
exports.updateAcademySettings = wrap(async (req) => svc.updateAcademySettings(req.body));

// Follow Batch
exports.followBatch = wrap(async (req) => {
  const { source_batch_id, cutoff_type, cutoff_value, selected_subjects } = req.body;
  return svc.followBatch(req.params.batchId, source_batch_id, cutoff_type, cutoff_value, selected_subjects || null);
});

// Excel Import
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

exports.importPlanExcel = [
  upload.single('file'),
  wrap(async (req) => {
    if (!req.file) throw { statusCode: 400, message: 'ফাইল দিন' };
    return svc.importPlanExcel(req.params.planId, req.file.buffer);
  }),
];
exports.importSubjectExcel = [
  upload.single('file'),
  wrap(async (req) => {
    if (!req.file) throw { statusCode: 400, message: 'ফাইল দিন' };
    return svc.importSubjectExcel(req.params.subjectId, req.file.buffer);
  }),
];
