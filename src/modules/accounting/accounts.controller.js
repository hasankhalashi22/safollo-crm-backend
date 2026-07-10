const accountsService = require('./accounts.service');

const getAccounts = async (req, res, next) => {
  try {
    const { type } = req.query;
    const result = await accountsService.getAccounts(type);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getAllAccounts = async (req, res, next) => {
  try {
    const result = await accountsService.getAllAccounts();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createAccount = async (req, res, next) => {
  try {
    const result = await accountsService.createAccount(req.body);
    res.status(201).json({ success: true, data: result, message: 'একাউন্ট তৈরি হয়েছে' });
  } catch (err) { next(err); }
};

const updateAccount = async (req, res, next) => {
  try {
    const result = await accountsService.updateAccount(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'একাউন্ট আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const getAccountBalance = async (req, res, next) => {
  try {
    const result = await accountsService.getAccountBalance(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getLedger = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const result = await accountsService.getLedger(req.params.id, date_from, date_to);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getTrialBalance = async (req, res, next) => {
  try {
    const { as_of_date } = req.query;
    const result = await accountsService.getTrialBalance(as_of_date);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getIncomeStatement = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const result = await accountsService.getIncomeStatement(date_from, date_to);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getBalanceSheet = async (req, res, next) => {
  try {
    const { as_of_date } = req.query;
    const result = await accountsService.getBalanceSheet(as_of_date);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getCashFlowStatement = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const result = await accountsService.getCashFlowStatement(date_from, date_to);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getEquityStatement = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const result = await accountsService.getEquityStatement(date_from, date_to);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getCreditCardsOverview = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const result = await accountsService.getCreditCardsOverview(date_from, date_to);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getInvestorsOverview = async (req, res, next) => {
  try {
    const result = await accountsService.getInvestorsOverview();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const toggleInvestorAccrual = async (req, res, next) => {
  try {
    const result = await accountsService.toggleInvestorAccrual(req.params.id, req.body.is_accruing);
    res.json({ success: true, data: result, message: 'Updated' });
  } catch (err) { next(err); }
};
const getInvestorHistory = async (req, res, next) => {
  try {
    const result = await accountsService.getInvestorHistory(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getShareholdersOverview = async (req, res, next) => {
  try {
    const result = await accountsService.getShareholdersOverview();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getGeneralJournal = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const result = await accountsService.getGeneralJournal(date_from, date_to);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const deleteAccount = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') throw { statusCode: 403, message: 'শুধু super admin একাউন্ট মুছতে পারবেন' };
    const result = await accountsService.deleteAccount(req.params.id);
    res.json({ success: true, data: result, message: 'একাউন্ট মুছে ফেলা হয়েছে' });
  } catch (err) { next(err); }
};

module.exports = { getAccounts, getAllAccounts, createAccount, updateAccount, deleteAccount, getAccountBalance, getLedger, getTrialBalance, getIncomeStatement, getBalanceSheet, getCashFlowStatement, getEquityStatement, getCreditCardsOverview, getInvestorsOverview, toggleInvestorAccrual, getInvestorHistory, getShareholdersOverview, getGeneralJournal };