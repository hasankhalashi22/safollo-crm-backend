const transactionsService = require('./transactions.service');
const auditService = require('../audit/audit.service');

const createTransaction = async (req, res, next) => {
  try {
    const result = await transactionsService.createTransaction(req.body, req.user.id, req.file || null);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'accounting',
      targetId: result.id,
      description: `${req.body.transaction_type} — ৳${req.body.amount}`,
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: result, message: 'ট্রানজেকশন রেকর্ড হয়েছে' });
  } catch (err) { next(err); }
};

const getTransactions = async (req, res, next) => {
  try {
    const { date_from, date_to, transaction_type, account_id, page, limit } = req.query;
    const result = await transactionsService.getTransactions({
      date_from, date_to, transaction_type, account_id,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const deleteTransaction = async (req, res, next) => {
  try {
    const result = await transactionsService.deleteTransaction(req.params.id);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'DELETE',
      module: 'accounting',
      targetId: req.params.id,
      description: `ট্রানজেকশন delete`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: result, message: 'ট্রানজেকশন delete হয়েছে' });
  } catch (err) { next(err); }
};

const updateTransaction = async (req, res, next) => {
  try {
    const result = await transactionsService.updateTransaction(req.params.id, req.body, req.file || null);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'UPDATE',
      module: 'accounting',
      targetId: req.params.id,
      description: `এন্ট্রি আপডেট`,
      newData: req.body,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: result, message: 'এন্ট্রি আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

module.exports = { createTransaction, getTransactions, deleteTransaction, updateTransaction };