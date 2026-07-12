const svc = require('./teacher.auth.service');
const { verifyToken } = require('../../utils/jwt');

const wrap = (fn) => async (req, res, next) => {
  try { const data = await fn(req, res); res.json({ success: true, data }); }
  catch (err) { next(err); }
};

// ── Teacher auth middleware ───────────────────────────────────────────────────
exports.authenticateTeacher = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'টোকেন নেই' });
  try {
    const payload = verifyToken(auth.slice(7));
    if (payload.role !== 'teacher') return res.status(403).json({ success: false, message: 'শুধু শিক্ষকদের জন্য' });
    req.teacher = { id: payload.teacherId };
    next();
  } catch { res.status(401).json({ success: false, message: 'টোকেন অবৈধ' }); }
};

// ── Public ────────────────────────────────────────────────────────────────────
exports.register = wrap(async (req) => svc.teacherRegister(req.body));
exports.login    = wrap(async (req) => svc.teacherLogin(req.body));

// ── Teacher protected ─────────────────────────────────────────────────────────
exports.getMyProfile  = wrap(async (req) => svc.getMyProfile(req.teacher.id));
exports.getMyClasses  = wrap(async (req) => svc.getMyClasses(req.teacher.id));
exports.getMyPayments = wrap(async (req) => svc.getMyPayments(req.teacher.id));

// ── Admin ─────────────────────────────────────────────────────────────────────
exports.updateMyProfile     = wrap(async (req) => svc.updateMyProfile(req.teacher.id, req.body));
exports.getPendingTeachers  = wrap(async (req) => svc.getPendingTeachers());
exports.approveTeacher      = wrap(async (req) => svc.approveTeacher(req.params.id, req.user.id, req.body.approved));
exports.resetTeacherPassword = wrap(async (req) => svc.resetTeacherPassword(req.params.id, req.body.password));
