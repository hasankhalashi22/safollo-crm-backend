const express = require('express');
const router = express.Router();
const accountsController = require('./accounts.controller');
const transactionsController = require('./transactions.controller');
const dashboardController = require('./dashboard.controller');
const cronController = require('./cron.controller');
const { authenticate, authorizeModule } = require('../../middleware/authenticate');
const { uploadPayment } = require('../../config/cloudinary');
const multer = require('multer');
const statementController = require('./statement.controller');
const reconciliationService = require('./reconciliation.service');
const { backfillMissingPayments } = require('./sync.service');
const uploadMemory = multer({ storage: multer.memoryStorage() });


// Cron route — no authentication, protected by secret query param
router.get('/cron/bkash-settlement', cronController.runBkashSettlement);
router.get('/cron/rocket-settlement', cronController.runRocketSettlement);
router.get('/cron/reprocess-all-settlements', cronController.reprocessAllSettlements);

router.use(authenticate);
router.use(authorizeModule('accounting'));
router.get('/settings', cronController.getSettings);
router.patch('/settings', cronController.updateSetting);

router.get('/dashboard', dashboardController.getDashboard);

router.get('/accounts', accountsController.getAccounts);
router.get('/accounts/all', accountsController.getAllAccounts);
router.post('/accounts', accountsController.createAccount);
router.patch('/accounts/:id', accountsController.updateAccount);
router.delete('/accounts/:id', accountsController.deleteAccount);
router.post('/accounts/:id/opening-balance', accountsController.setOpeningBalance);
router.post('/accounts/:id/accrued-profit-override', accountsController.setAccruedProfitOverride);
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
router.post('/card-statements/confirm', uploadMemory.any(), statementController.confirmStatement);
router.post('/transactions/distribute-profit', transactionsController.distributeProfitToShareholders);
router.get('/shareholders', accountsController.getShareholdersOverview);
router.get('/journal', accountsController.getGeneralJournal);
router.post('/backfill-payments', async (req, res, next) => {
  try {
    const result = await backfillMissingPayments(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/resync-edited-payments', async (req, res, next) => {
  try {
    const { query, withTransaction } = require('../../config/database');
    const { syncPaymentToAccounting, removeSyncedTransaction } = require('./sync.service');

    // Find payments where accounting amount differs from actual payment amount
    const mismatch = await query(`
      SELECT p.id as payment_id, p.amount as actual_amount,
             t.amount as synced_amount, p.enrollment_id,
             p.payment_method, p.is_due_payment, p.created_at,
             p.transaction_id, p.payment_proof_url, p.sender_number
      FROM payments p
      JOIN acc_transactions t ON t.payment_id = p.id
      WHERE ABS(p.amount - t.amount) > 0.01
        AND p.approval_status = 'approved'
    `);

    let fixed = 0;
    const errors = [];
    for (const row of mismatch.rows) {
      try {
        await removeSyncedTransaction(row.payment_id);
        await syncPaymentToAccounting(
          { id: row.payment_id, amount: row.actual_amount, payment_method: row.payment_method,
            is_due_payment: row.is_due_payment, created_at: row.created_at,
            transaction_id: row.transaction_id, payment_proof_url: row.payment_proof_url,
            sender_number: row.sender_number, approval_status: 'approved' },
          row.enrollment_id, req.user.id
        );
        fixed++;
      } catch (e) {
        errors.push({ payment_id: row.payment_id, error: e.message });
      }
    }

    res.json({ success: true, total_mismatch: mismatch.rows.length, fixed, errors,
      message: `${fixed}টি ভুল accounting entry ঠিক করা হয়েছে` });
  } catch (err) { next(err); }
});

router.get('/reconciliation', async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const result = await reconciliationService.getReconciliation({ date_from, date_to });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.post('/transactions', uploadPayment.single('proof'), transactionsController.createTransaction);
router.get('/transactions', transactionsController.getTransactions);
router.delete('/transactions/:id', transactionsController.deleteTransaction);
router.patch('/transactions/:id', uploadPayment.single('proof'), transactionsController.updateTransaction);

module.exports = router;