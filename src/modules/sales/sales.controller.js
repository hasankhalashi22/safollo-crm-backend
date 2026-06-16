const syncService = require('../accounting/sync.service');
const salesService = require('./sales.service');
const auditService = require('../audit/audit.service');
const notificationsService = require('../notifications/notifications.service');

const createSale = async (req, res, next) => {
  try {
    const result = await salesService.createSale(req.body, req.user.id, req.file || null);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'sales',
      targetId: result.enrollment?.id,
      targetName: req.body.student_phone,
      description: `নতুন সেল — ${req.body.student_phone}`,
      ipAddress: req.ip,
    });
    notificationsService.sendToApprovers(
      'নতুন সেল এন্ট্রি 🔔',
      `${req.body.student_phone} - নতুন সেল approval-এর অপেক্ষায়`
    );
    res.status(201).json({ success: true, data: result, message: 'সেল সফলভাবে রেকর্ড হয়েছে' });
  } catch (err) { next(err); }
};

const getSales = async (req, res, next) => {
  try {
    const { course_id, payment_status, date_from, date_to, search, page, limit, executive_id } = req.query;
    console.log('Sales filter:', req.query);
    console.log('User info:', { id: req.user.id, role: req.user.role, roleLevel: req.user.role_level });
    const result = await salesService.getSales({
      executiveId: req.user.id,
      role: req.user.role,
      roleLevel: req.user.role_level,
      course_id, payment_status, date_from, date_to, search,
      filter_executive_id: executive_id,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const getSaleById = async (req, res, next) => {
  try {
    const result = await salesService.getSaleById(req.params.id, req.user.id, req.user.role_level);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getDueList = async (req, res, next) => {
  try {
    const result = await salesService.getDueList({
      executiveId: req.user.id,
      roleLevel: req.user.role_level,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 500,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const editSale = async (req, res, next) => {
  try {
    const result = await salesService.editSale(req.params.id, req.body);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'UPDATE',
      module: 'sales',
      targetId: req.params.id,
      description: `সেল আপডেট`,
      newData: req.body,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: result, message: 'সেল আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const reassignDue = async (req, res, next) => {
  try {
    const { new_executive_id } = req.body;
    const result = await salesService.reassignDue(req.params.id, new_executive_id);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'REASSIGN',
      module: 'sales',
      targetId: req.params.id,
      newData: { new_executive_id },
      description: `Due reassign`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: result, message: 'রিঅ্যাসাইন হয়েছে' });
  } catch (err) { next(err); }
};

const deleteSale = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    if (role !== 'super_admin') {
      const checkResult = await require('../../config/database').query(
        'SELECT * FROM enrollments WHERE id = $1',
        [id]
      );
      if (checkResult.rows.length === 0) throw { statusCode: 404, message: 'সেল পাওয়া যায়নি' };
      const enrollment = checkResult.rows[0];
      if (enrollment.executive_id !== userId) throw { statusCode: 403, message: 'এই সেল delete করার অনুমতি নেই' };
      if (enrollment.approval_status !== 'rejected' && enrollment.approval_status !== 'pending') {
        throw { statusCode: 400, message: 'শুধু pending বা rejected সেল বাতিল করা যাবে' };
      }
    }

await syncService.removeSyncedByEnrollment(id);
    const result = await salesService.deleteSale(id);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'DELETE',
      module: 'sales',
      targetId: id,
      description: `সেল delete`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: result, message: 'সেল delete হয়েছে' });
  } catch (err) { next(err); }
};

const getRevenue = async (req, res, next) => {
  try {
    const { course_id, date_from, date_to, search, executive_id, payment_method } = req.query;
    const result = await salesService.getRevenue({
      executiveId: req.user.id,
      roleLevel: req.user.role_level,
      course_id, date_from, date_to, search,
      filter_executive_id: executive_id,
      payment_method,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

module.exports = { createSale, getSales, getSaleById, getDueList, editSale, reassignDue, deleteSale, getRevenue };