const express = require('express');
const router = express.Router();
const accountsController = require('./accounts.controller');
const transactionsController = require('./transactions.controller');
const dashboardController = require('./dashboard.controller');
const cronController = require('./cron.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');
const { uploadPayment } = require('../../config/cloudinary');
const multer = require('multer');
const statementController = require('./statement.controller');
const uploadMemory = multer({ storage: multer.memoryStorage() });


// Cron route — no authentication, protected by secret query param
router.get('/cron/bkash-settlement', cronController.runBkashSettlement);
router.get('/cron/rocket-settlement', cronController.runRocketSettlement);

router.use(authenticate);
router.use(authorize('super_admin'));
router.get('/settings', cronController.getSettings);
router.patch('/settings', cronController.updateSetting);

router.get('/dashboard', dashboardController.getDashboard);

router.get('/accounts', accountsController.getAccounts);
router.get('/accounts/all', accountsController.getAllAccounts);
router.post('/accounts', accountsController.createAccount);
router.patch('/accounts/:id', accountsController.updateAccount);
router.get('/accounts/:id/balance', accountsController.getAccountBalance);
router.get('/accounts/:id/ledger', accountsController.getLedger);
router.get('/trial-balance', accountsController.getTrialBalance);
router.get('/income-statement', accountsController.getIncomeStatement);
router.get('/balance-sheet', accountsController.getBalanceSheet);
router.get('/cash-flow', accountsController.getCashFlowStatement);
router.get('/equity-statement', accountsController.getEquityStatement);
router.get('/credit-cards', accountsController.getCreditCardsOverview);
router.get('/investors', accountsController.getInvestorsOverview);
router.patch('/investors/:id/accrual', accountsController.toggleInvestorAccrual);
router.get('/investors/:id/history', accountsController.getInvestorHistory);
router.post('/card-statements/analyze', uploadMemory.single('statement'), statementController.analyzeStatement);
router.post('/card-statements/confirm', uploadMemory.none(), statementController.confirmStatement);

router.post('/transactions', uploadPayment.single('proof'), transactionsController.createTransaction);
router.get('/transactions', transactionsController.getTransactions);
router.delete('/transactions/:id', transactionsController.deleteTransaction);
router.patch('/transactions/:id', uploadPayment.single('proof'), transactionsController.updateTransaction);

module.exports = router;