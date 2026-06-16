const { query, withTransaction } = require('../../config/database');

// Transaction type → which side is debit/credit determined by accounts passed in
const createTransaction = async (data, userId, proofFile) => {
  const {
    transaction_date, transaction_type, description, amount,
    debit_account_id, credit_account_id,
    reference_no, enrollment_id, employee_id, teacher_id, related_account_id
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
          reference_no, enrollment_id, employee_id, teacher_id, created_by, related_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [transaction_date, transaction_type, description || null, amount,
       debit_account_id, credit_account_id, proofUrl, proofType,
       reference_no || null, enrollment_id || null, employee_id || null,
       teacher_id || null, userId, related_account_id || null]
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

    return txn;
  });
};

const getTransactions = async ({ date_from, date_to, transaction_type, account_id, page = 1, limit = 50 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (date_from) { conditions.push(`t.transaction_date >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`t.transaction_date <= $${idx++}`); params.push(date_to); }
  if (transaction_type) { conditions.push(`t.transaction_type = $${idx++}`); params.push(transaction_type); }
  if (account_id) { conditions.push(`(t.debit_account_id = $${idx} OR t.credit_account_id = $${idx})`); params.push(account_id); idx++; }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT t.*,
            da.name as debit_account_name,
            ca.name as credit_account_name,
            u.phone as created_by_phone,
            sp.full_name as created_by_name
     FROM acc_transactions t
     LEFT JOIN acc_accounts da ON da.id = t.debit_account_id
     LEFT JOIN acc_accounts ca ON ca.id = t.credit_account_id
     LEFT JOIN users u ON u.id = t.created_by
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
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
  await query('DELETE FROM acc_journal_entries WHERE transaction_id = $1', [id]);
  const result = await query('DELETE FROM acc_transactions WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw { statusCode: 404, message: 'ট্রানজেকশন পাওয়া যায়নি' };
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

module.exports = { createTransaction, getTransactions, deleteTransaction, updateTransaction };