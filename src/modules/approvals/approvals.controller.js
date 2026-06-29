const { syncPaymentToAccounting, syncReceivableOnApproval, removeSyncedTransaction } = require('../accounting/sync.service');
const approvalsService = require('./approvals.service');
const auditService = require('../audit/audit.service');
const notificationsService = require('../notifications/notifications.service');

const getPendingApprovals = async (req, res, next) => {
  try {
    const result = await approvalsService.getPendingApprovals({
      userId: req.user.id,
      roleLevel: req.user.role_level,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const getPendingDuePayments = async (req, res, next) => {
  try {
    const result = await approvalsService.getPendingDuePayments({
      userId: req.user.id,
      roleLevel: req.user.role_level,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const getMyPendingList = async (req, res, next) => {
  try {
    const result = await approvalsService.getMyPendingList(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const getMyPendingDue = async (req, res, next) => {
  try {
    const result = await approvalsService.getMyPendingDue(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const approveSale = async (req, res, next) => {
  try {
    const approverName = req.user.full_name || req.user.phone;
    const result = await approvalsService.approveSale(req.params.id, req.user.id, approverName, req.body);
    const enrollment = result.enrollment;
    auditService.log({
      userId: req.user.id, userName: approverName, userRole: req.user.role,
      action: 'APPROVE', module: 'sales', targetId: req.params.id,
      description: `সেল Approve`, ipAddress: req.ip,
    });
    notificationsService.sendToUser(enrollment.executive_id, 'সেল Approve হয়েছে ✅', 'আপনার সেল approve করা হয়েছে');

    if (result.payment) {
      syncPaymentToAccounting(result.payment, enrollment.id, req.user.id);
    }
    // Record Accounts Receivable for any due amount at approval time
    syncReceivableOnApproval(enrollment, req.user.id);

    res.json({ success: true, data: enrollment, message: 'সেল Approve হয়েছে ✅' });
  } catch (err) { next(err); }
};
const rejectSale = async (req, res, next) => {
  try {
    const rejectorName = req.user.full_name || req.user.phone;
    const result = await approvalsService.rejectSale(req.params.id, req.user.id, rejectorName, req.body.reason);
    auditService.log({
      userId: req.user.id, userName: rejectorName, userRole: req.user.role,
      action: 'REJECT', module: 'sales', targetId: req.params.id,
      description: `সেল Reject — ${req.body.reason || 'কারণ নেই'}`, ipAddress: req.ip,
    });
    notificationsService.sendToUser(result.executive_id, 'সেল Reject হয়েছে ❌', `কারণ: ${req.body.reason || 'কারণ দেওয়া হয়নি'}`);
    res.json({ success: true, data: result, message: 'সেল Reject হয়েছে' });
  } catch (err) { next(err); }
};

const resubmitSale = async (req, res, next) => {
  try {
    const result = await approvalsService.resubmitSale(req.params.id, req.user.id, req.body);
    notificationsService.sendToApprovers('সেল Resubmit হয়েছে 🔄', 'একটি rejected সেল পুনরায় submit করা হয়েছে');
    res.json({ success: true, data: result, message: 'সেল Resubmit হয়েছে' });
  } catch (err) { next(err); }
};

const approveDuePayment = async (req, res, next) => {
  try {
    const approverName = req.user.full_name || req.user.phone;
    const result = await approvalsService.approveDuePayment(req.params.id, req.user.id, approverName);
    auditService.log({
      userId: req.user.id, userName: approverName, userRole: req.user.role,
      action: 'APPROVE', module: 'payment', targetId: req.params.id,
      description: `বকেয়া Payment Approve`, ipAddress: req.ip,
    });
    notificationsService.sendToUser(result.executive_id, 'বকেয়া Payment Approve হয়েছে ✅', 'আপনার বকেয়া payment approve করা হয়েছে');

    syncPaymentToAccounting(result, result.enrollment_id, req.user.id);

    res.json({ success: true, data: result, message: 'Payment Approve হয়েছে ✅' });
  } catch (err) { next(err); }
};

const rejectDuePayment = async (req, res, next) => {
  try {
    const result = await approvalsService.rejectDuePayment(req.params.id, req.user.id, req.body.reason);
    auditService.log({
      userId: req.user.id, userName: req.user.phone, userRole: req.user.role,
      action: 'REJECT', module: 'payment', targetId: req.params.id,
      description: `বকেয়া Payment Reject`, ipAddress: req.ip,
    });
    notificationsService.sendToUser(result.executive_id, 'বকেয়া Payment Reject হয়েছে ❌', `কারণ: ${req.body.reason || 'কারণ দেওয়া হয়নি'}`);
    removeSyncedTransaction(req.params.id);
    res.json({ success: true, data: result, message: 'Payment Reject হয়েছে' });
  } catch (err) { next(err); }
};
const resubmitDuePayment = async (req, res, next) => {
  try {
    const result = await approvalsService.resubmitDuePayment(req.params.id);
    notificationsService.sendToApprovers('বকেয়া Payment Resubmit 🔄', 'একটি rejected payment পুনরায় submit করা হয়েছে');
    res.json({ success: true, data: result, message: 'Payment Resubmit হয়েছে ✅' });
  } catch (err) { next(err); }
};

module.exports = {
  getPendingApprovals, getPendingDuePayments,
  getMyPendingList, getMyPendingDue,
  approveSale, rejectSale, resubmitSale,
  approveDuePayment, rejectDuePayment, resubmitDuePayment
};