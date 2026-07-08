const { query, withTransaction } = require('../../config/database');

// Map CRM payment_method to accounting asset account name
const METHOD_TO_ACCOUNT = {
  bkash: 'bKash Wallet',
  nagad: 'Nagad Wallet',
  rocket: 'Rocket Wallet',
  cash: 'Petty Cash',
  cod: 'Steadfast Wallet',
};

const getAccountIdByName = async (name) => {
  const result = await query('SELECT id FROM acc_accounts WHERE name = $1', [name]);
  return result.rows[0]?.id || null;
};

// Create accounting entry for an approved CRM payment (enrollment or due payment)
const syncPaymentToAccounting = async (payment, enrollmentId, createdBy) => {
  try {
    const assetAccountName = METHOD_TO_ACCOUNT[payment.payment_method] || 'Cash';
    const assetAccountId = await getAccountIdByName(assetAccountName);

    // Check if this enrollment is for a book
    const courseCheck = await query(
      `SELECT c.is_book FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.id = $1`,
      [enrollmentId]
    );
    const isBook = courseCheck.rows[0]?.is_book || false;
    const revenueAccountId = await getAccountIdByName(isBook ? 'Book Sales' : 'Course Sales');
    const receivableAccountId = await getAccountIdByName('Accounts Receivable');

    if (!assetAccountId || !revenueAccountId) {
      console.error('Sync error: account not found for', assetAccountName);
      return;
    }

    // Check if already synced
    const existing = await query('SELECT id FROM acc_transactions WHERE payment_id = $1', [payment.id]);
    if (existing.rows.length > 0) return;

    const txnDate = payment.created_at ? payment.created_at.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    if (payment.is_due_payment) {
      // Due payment: Cash/bKash Dr, Accounts Receivable Cr
      if (!receivableAccountId) {
        console.error('Sync error: Accounts Receivable account not found');
        return;
      }
      await withTransaction(async (client) => {
        const txnResult = await client.query(
          `INSERT INTO acc_transactions
             (transaction_date, transaction_type, description, amount,
              debit_account_id, credit_account_id, source, payment_id,
              enrollment_id, created_by, proof_url)
           VALUES ($1, 'revenue', $2, $3, $4, $5, 'crm_sync', $6, $7, $8, $9)
           RETURNING *`,
          [txnDate, `বকেয়া পেমেন্ট সংগ্রহ`, payment.amount, assetAccountId, receivableAccountId, payment.id, enrollmentId, createdBy, payment.payment_proof_url || null]
        );
        const txn = txnResult.rows[0];
        await client.query(
          `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1, $2, 'debit', $3, $4)`,
          [txn.id, assetAccountId, payment.amount, txnDate]
        );
        await client.query(
          `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1, $2, 'credit', $3, $4)`,
          [txn.id, receivableAccountId, payment.amount, txnDate]
        );
      });
    } else {
      // New enrollment payment: Cash Dr, Revenue Cr
      await withTransaction(async (client) => {
        const txnResult = await client.query(
          `INSERT INTO acc_transactions
             (transaction_date, transaction_type, description, amount,
              debit_account_id, credit_account_id, source, payment_id,
              enrollment_id, created_by, proof_url)
           VALUES ($1, 'revenue', $2, $3, $4, $5, 'crm_sync', $6, $7, $8, $9)
           RETURNING *`,
          [txnDate, `নতুন এনরোলমেন্ট পেমেন্ট`, payment.amount, assetAccountId, revenueAccountId, payment.id, enrollmentId, createdBy, payment.payment_proof_url || null]
        );
        const txn = txnResult.rows[0];
        await client.query(
          `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1, $2, 'debit', $3, $4)`,
          [txn.id, assetAccountId, payment.amount, txnDate]
        );
        await client.query(
          `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1, $2, 'credit', $3, $4)`,
          [txn.id, revenueAccountId, payment.amount, txnDate]
        );
      });
    }
  } catch (err) {
    console.error('syncPaymentToAccounting error:', err.message);
  }
};

// Create Accounts Receivable entry when enrollment has due amount at approval time
const syncReceivableOnApproval = async (enrollment, createdBy) => {
  try {
    const dueAmount = Number(enrollment.course_price) - Number(enrollment.total_collected);
    if (dueAmount <= 0) return;

    const courseCheck = await query(`SELECT is_book FROM courses WHERE id = $1`, [enrollment.course_id]);
    const isBook = courseCheck.rows[0]?.is_book || false;
    const revenueAccountId = await getAccountIdByName(isBook ? 'Book Sales' : 'Course Sales');
    const receivableAccountId = await getAccountIdByName('Accounts Receivable');

    if (!revenueAccountId || !receivableAccountId) {
      console.error('Sync error: Revenue or Accounts Receivable account not found');
      return;
    }

    // Check if receivable entry already exists for this enrollment
    const existing = await query(
      `SELECT id FROM acc_transactions WHERE enrollment_id = $1 AND description LIKE '%বাকি%'`,
      [enrollment.id]
    );
    if (existing.rows.length > 0) return;

    const txnDate = enrollment.approved_at ? enrollment.approved_at.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    await withTransaction(async (client) => {
      const txnResult = await client.query(
        `INSERT INTO acc_transactions
           (transaction_date, transaction_type, description, amount,
            debit_account_id, credit_account_id, source, enrollment_id, created_by)
         VALUES ($1, 'revenue', $2, $3, $4, $5, 'crm_sync', $6, $7)
         RETURNING *`,
        [txnDate, `এনরোলমেন্ট বাকি — Accounts Receivable`, dueAmount, receivableAccountId, revenueAccountId, enrollment.id, createdBy]
      );
      const txn = txnResult.rows[0];
      await client.query(
        `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1, $2, 'debit', $3, $4)`,
        [txn.id, receivableAccountId, dueAmount, txnDate]
      );
      await client.query(
        `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1, $2, 'credit', $3, $4)`,
        [txn.id, revenueAccountId, dueAmount, txnDate]
      );
    });
  } catch (err) {
    console.error('syncReceivableOnApproval error:', err.message);
  }
};

// Remove accounting entry when CRM payment is rejected/deleted
const removeSyncedTransaction = async (paymentId) => {
  try {
    const result = await query('SELECT id FROM acc_transactions WHERE payment_id = $1', [paymentId]);
    if (result.rows.length === 0) return;
    const txnId = result.rows[0].id;
    await query('DELETE FROM acc_journal_entries WHERE transaction_id = $1', [txnId]);
    await query('DELETE FROM acc_transactions WHERE id = $1', [txnId]);
  } catch (err) {
    console.error('removeSyncedTransaction error:', err.message);
  }
};

// Remove all synced transactions for an enrollment (when enrollment deleted)
const removeSyncedByEnrollment = async (enrollmentId) => {
  try {
    const result = await query('SELECT id FROM acc_transactions WHERE enrollment_id = $1', [enrollmentId]);
    for (const row of result.rows) {
      await query('DELETE FROM acc_journal_entries WHERE transaction_id = $1', [row.id]);
    }
    await query('DELETE FROM acc_transactions WHERE enrollment_id = $1', [enrollmentId]);
  } catch (err) {
    console.error('removeSyncedByEnrollment error:', err.message);
  }
};

// Backfill all approved CRM payments + missing AR entries
const backfillMissingPayments = async (createdBy) => {
  // 1. Missing payment entries
  const paymentResult = await query(
    `SELECT p.*, e.id as enrollment_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.approval_status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM acc_transactions t WHERE t.payment_id = p.id
       )
     ORDER BY p.created_at ASC`
  );

  let paymentsSynced = 0;
  const failed = [];

  for (const payment of paymentResult.rows) {
    try {
      await syncPaymentToAccounting(payment, payment.enrollment_id, createdBy);
      paymentsSynced++;
    } catch (err) {
      failed.push({ payment_id: payment.id, error: err.message });
    }
  }

  // 2. Missing AR receivable entries for enrollments with due amounts
  const arResult = await query(
    `SELECT e.*
     FROM enrollments e
     WHERE e.approval_status = 'approved'
       AND e.payment_status IN ('due', 'partial')
       AND (e.course_price - e.total_collected) > 0
       AND NOT EXISTS (
         SELECT 1 FROM acc_transactions t
         WHERE t.enrollment_id = e.id
           AND t.source = 'crm_sync'
           AND t.description LIKE '%বাকি%'
       )
     ORDER BY e.approved_at ASC`
  );

  let arSynced = 0;

  for (const enrollment of arResult.rows) {
    try {
      await syncReceivableOnApproval(enrollment, createdBy);
      arSynced++;
    } catch (err) {
      failed.push({ enrollment_id: enrollment.id, error: err.message });
    }
  }

  return {
    payments_total: paymentResult.rows.length,
    payments_synced: paymentsSynced,
    ar_total: arResult.rows.length,
    ar_synced: arSynced,
    failed,
    message: `${paymentsSynced}টি payment ও ${arSynced}টি AR entry sync হয়েছে`,
  };
};

module.exports = { syncPaymentToAccounting, syncReceivableOnApproval, removeSyncedTransaction, removeSyncedByEnrollment, backfillMissingPayments };