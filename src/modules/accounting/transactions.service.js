const { query, withTransaction } = require('../../config/database');

// Transaction type → which side is debit/credit determined by accounts passed in
const createTransaction = async (data, userId, proofFile) => {
  const {
    transaction_date, transaction_type, description, amount,
    debit_account_id, credit_account_id,
    reference_no, enrollment_id, employee_id, teacher_id, related_account_id,
    usd_amount
  } = data;

  if (!debit_account_id || !credit_account_id) {
    throw { statusCode: 400, message: 'Debit ও Credit account দিন' };
  }
  if (!amount || parseFloat(amount) <= 0) {
    throw { statusCode: 400, message: 'সঠিক পরিমাণ দিন' };
  }

  const proofUrl = proofFile?.path || null;
  const proofType = proofFile ? (data.proof_type || 'voucher') : null;

  return await withTransaction(async (client) => {
   const txnResult = await client.query(
      `INSERT INTO acc_transactions
         (transaction_date, transaction_type, description, amount,
          debit_account_id, credit_account_id, proof_url, proof_type,
          reference_no, enrollment_id, employee_id, teacher_id, created_by, related_account_id, usd_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [transaction_date, transaction_type, description || null, amount,
       debit_account_id, credit_account_id, proofUrl, proofType,
       reference_no || null, enrollment_id || null, employee_id || null,
       teacher_id || null, userId, related_account_id || null,
       (usd_amount && parseFloat(usd_amount) > 0) ? parseFloat(usd_amount) : null]
    );
    const txn = txnResult.rows[0];

    // Auto double-entry journal
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date)
       VALUES ($1, $2, 'debit', $3, $4)`,
      [txn.id, debit_account_id, amount, transaction_date]
    );
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date)
       VALUES ($1, $2, 'credit', $3, $4)`,
      [txn.id, credit_account_id, amount, transaction_date]
    );

    // Investor payment: clear accrued_profit_override so auto-calculation resumes
    if (transaction_type === 'investor_profit_payment') {
      await client.query(
        `UPDATE acc_accounts SET accrued_profit_override = NULL WHERE id = $1 AND account_subtype = 'investor_loan'`,
        [debit_account_id]
      );
    }

    // USD outstanding update for credit card transactions
    if (usd_amount && parseFloat(usd_amount) > 0) {
      if (transaction_type === 'credit_card_charge') {
        // Interest/charge: USD outstanding increases on credit account (the card)
        await client.query(
          `UPDATE acc_accounts SET usd_outstanding = COALESCE(usd_outstanding, 0) + $1 WHERE id = $2`,
          [parseFloat(usd_amount), credit_account_id]
        );
      } else if (transaction_type === 'credit_card_payment') {
        // Payment: USD outstanding decreases on debit account (the card)
        await client.query(
          `UPDATE acc_accounts SET usd_outstanding = GREATEST(COALESCE(usd_outstanding, 0) - $1, 0) WHERE id = $2`,
          [parseFloat(usd_amount), debit_account_id]
        );
      }
    }

    return txn;
  });
};

const getTransactions = async ({ date_from, date_to, transaction_type, account_id, student_phone, page = 1, limit = 50 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (date_from) { conditions.push(`t.transaction_date >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`t.transaction_date <= $${idx++}`); params.push(date_to); }
  if (transaction_type) { conditions.push(`t.transaction_type = $${idx++}`); params.push(transaction_type); }
  if (account_id) { conditions.push(`(t.debit_account_id = $${idx} OR t.credit_account_id = $${idx})`); params.push(account_id); idx++; }
  if (student_phone) {
    conditions.push(`t.enrollment_id IN (
      SELECT e.id FROM enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE s.phone LIKE $${idx++}
    )`);
    params.push(`%${student_phone}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT t.*,
            da.name as debit_account_name,
            ca.name as credit_account_name,
            u.phone as created_by_phone,
            sp.full_name as created_by_name,
            s.name as student_name,
            s.phone as student_phone
     FROM acc_transactions t
     LEFT JOIN acc_accounts da ON da.id = t.debit_account_id
     LEFT JOIN acc_accounts ca ON ca.id = t.credit_account_id
     LEFT JOIN users u ON u.id = t.created_by
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN enrollments e ON e.id = t.enrollment_id
     LEFT JOIN students s ON s.id = e.student_id
     ${where}
     ORDER BY t.transaction_date DESC, t.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM acc_transactions t ${where}`,
    params
  );

  return { data: result.rows, total: parseInt(countResult.rows[0].count), page, limit };
};

const deleteTransaction = async (id) => {
  const txnResult = await query(
    `SELECT transaction_type, debit_account_id, credit_account_id, usd_amount FROM acc_transactions WHERE id = $1`,
    [id]
  );
  if (txnResult.rows.length === 0) throw { statusCode: 404, message: 'ট্রানজেকশন পাওয়া যায়নি' };
  const txn = txnResult.rows[0];

  await query('DELETE FROM acc_journal_entries WHERE transaction_id = $1', [id]);
  await query('DELETE FROM acc_transactions WHERE id = $1', [id]);

  // Reverse usd_outstanding if applicable
  if (txn.usd_amount && parseFloat(txn.usd_amount) > 0) {
    if (txn.transaction_type === 'credit_card_charge') {
      await query(
        `UPDATE acc_accounts SET usd_outstanding = GREATEST(COALESCE(usd_outstanding, 0) - $1, 0) WHERE id = $2`,
        [parseFloat(txn.usd_amount), txn.credit_account_id]
      );
    } else if (txn.transaction_type === 'credit_card_payment') {
      await query(
        `UPDATE acc_accounts SET usd_outstanding = COALESCE(usd_outstanding, 0) + $1 WHERE id = $2`,
        [parseFloat(txn.usd_amount), txn.debit_account_id]
      );
    }
  }

  return { deleted: true };
};

const updateTransaction = async (id, data, proofFile) => {
  const {
    transaction_date, transaction_type, description, amount,
    debit_account_id, credit_account_id, reference_no
  } = data;

  if (!debit_account_id || !credit_account_id) {
    throw { statusCode: 400, message: 'Debit ও Credit account দিন' };
  }
  if (!amount || parseFloat(amount) <= 0) {
    throw { statusCode: 400, message: 'সঠিক পরিমাণ দিন' };
  }

  return await withTransaction(async (client) => {
    const fields = [
      `transaction_date = $1`, `transaction_type = $2`, `description = $3`,
      `amount = $4`, `debit_account_id = $5`, `credit_account_id = $6`,
      `reference_no = $7`, `updated_at = NOW()`
    ];
    const params = [transaction_date, transaction_type, description || null,
      amount, debit_account_id, credit_account_id, reference_no || null];

    if (proofFile?.path) {
      fields.push(`proof_url = $${params.length + 1}`);
      params.push(proofFile.path);
    }

    const result = await client.query(
      `UPDATE acc_transactions SET ${fields.join(', ')} WHERE id = $${params.length + 1} RETURNING *`,
      [...params, id]
    );
    if (result.rows.length === 0) throw { statusCode: 404, message: 'ট্রানজেকশন পাওয়া যায়নি' };

    // Recreate journal entries
    await client.query('DELETE FROM acc_journal_entries WHERE transaction_id = $1', [id]);
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date)
       VALUES ($1, $2, 'debit', $3, $4)`,
      [id, debit_account_id, amount, transaction_date]
    );
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date)
       VALUES ($1, $2, 'credit', $3, $4)`,
      [id, credit_account_id, amount, transaction_date]
    );

    return result.rows[0];
  });
};
const distributeProfitToShareholders = async (data, userId) => {
  const { transaction_date, total_amount, paid_from_account_id, description } = data;

  if (!total_amount || parseFloat(total_amount) <= 0) {
    throw { statusCode: 400, message: 'সঠিক পরিমাণ দিন' };
  }
  if (!paid_from_account_id) {
    throw { statusCode: 400, message: 'কোথা থেকে দেওয়া হচ্ছে সেটা বেছে নিন' };
  }

  const shareholdersResult = await query(
    `SELECT id, name, shareholder_name, share_percentage FROM acc_accounts
     WHERE account_subtype = 'shareholder' AND is_active = TRUE AND share_percentage IS NOT NULL`
  );
  const shareholders = shareholdersResult.rows;

  if (shareholders.length === 0) {
    throw { statusCode: 400, message: 'কোনো শেয়ারহোল্ডার একাউন্ট পাওয়া যায়নি' };
  }

  const totalPercentage = shareholders.reduce((sum, s) => sum + parseFloat(s.share_percentage), 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw { statusCode: 400, message: `শেয়ারহোল্ডারদের মোট শেয়ার ১০০% হতে হবে, বর্তমানে ${totalPercentage}%` };
  }

  return await withTransaction(async (client) => {
    const txnResult = await client.query(
      `INSERT INTO acc_transactions
         (transaction_date, transaction_type, description, amount,
          debit_account_id, credit_account_id, created_by)
       VALUES ($1, 'profit_distribution', $2, $3, $4, $4, $5)
       RETURNING *`,
      [transaction_date, description || 'Profit distribution to shareholders',
       total_amount, paid_from_account_id, userId]
    );
    const txn = txnResult.rows[0];

    // Credit: cash/bank account decreases (full amount)
    await client.query(
      `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date)
       VALUES ($1, $2, 'credit', $3, $4)`,
      [txn.id, paid_from_account_id, total_amount, transaction_date]
    );

    // Debit: each shareholder's equity account decreases by their share
    const breakdown = [];
    for (const sh of shareholders) {
      const shareAmount = Math.round((parseFloat(total_amount) * parseFloat(sh.share_percentage) / 100) * 100) / 100;
      await client.query(
        `INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date)
         VALUES ($1, $2, 'debit', $3, $4)`,
        [txn.id, sh.id, shareAmount, transaction_date]
      );
      breakdown.push({ shareholder: sh.shareholder_name || sh.name, percentage: sh.share_percentage, amount: shareAmount });
    }

    return { ...txn, breakdown };
  });
};

module.exports = { createTransaction, getTransactions, deleteTransaction, updateTransaction, distributeProfitToShareholders };