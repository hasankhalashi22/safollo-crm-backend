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

// Create accounting Cash In entry for an approved CRM payment
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

    if (!assetAccountId || !revenueAccountId) {
      console.error('Sync error: account not found for', assetAccountName);
      return;
    }

    // Check if already synced
    const existing = await query('SELECT id FROM acc_transactions WHERE payment_id = $1', [payment.id]);
    if (existing.rows.length > 0) return;

    await withTransaction(async (client) => {
      const txnResult = await client.query(
        `INSERT INTO acc_transactions
           (transaction_date, transaction_type, description, amount,
            debit_account_id, credit_account_id, source, payment_id,
            enrollment_id, created_by)
         VALUES ($1, 'revenue', $2, $3, $4, $5, 'crm_sync', $6, $7, $8)
         RETURNING *`,
        [
          payment.created_at ? payment.created_at.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          `CRM সেল — ${payment.is_due_payment ? 'বকেয়া পেমেন্ট' : 'নতুন এনরোলমেন্ট'}`,
          payment.amount,
          assetAccountId,
          revenueAccountId,
          payment.id,
          enrollmentId,
          createdBy
        ]
      );
      const txn = txnResult.rows[0];

      await client.query(
        `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date)
         VALUES ($1, $2, 'debit', $3, $4)`,
        [txn.id, assetAccountId, payment.amount, txn.transaction_date]
      );
      await client.query(
        `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date)
         VALUES ($1, $2, 'credit', $3, $4)`,
        [txn.id, revenueAccountId, payment.amount, txn.transaction_date]
      );
    });
  } catch (err) {
    console.error('syncPaymentToAccounting error:', err.message);
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

module.exports = { syncPaymentToAccounting, removeSyncedTransaction, removeSyncedByEnrollment };