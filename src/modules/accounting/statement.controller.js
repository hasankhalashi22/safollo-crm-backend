const { extractStatementData } = require('./gemini.service');
const transactionsService = require('./transactions.service');
const { query } = require('../../config/database');

// Step 1: Upload statement, extract data with AI, return preview (does NOT save transaction yet)
const analyzeStatement = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { account_id } = req.body;
    if (!account_id) return res.status(400).json({ success: false, message: 'account_id is required' });

    const mimeType = req.file.mimetype;
    const fileBuffer = req.file.buffer;
    const extracted = await extractStatementData(fileBuffer, mimeType);

    res.json({
      success: true,
      data: { extracted, account_id },
    });
  } catch (err) { next(err); }
};

// Step 2: Confirm and create the actual Card Charge transaction + save statement record
const confirmStatement = async (req, res, next) => {
  try {
    const {
      account_id, statement_date, total_interest_charged,
      total_statement_amount, academy_used_amount, academy_interest_share,
      raw_ai_response,
    } = req.body;

    if (!account_id || !academy_interest_share) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Find or create Interest Expense account
    let interestAccount = await query(`SELECT id FROM acc_accounts WHERE name = 'Credit Card Interest Expense'`);
    let interestAccountId;
    if (interestAccount.rows.length === 0) {
      const created = await query(
        `INSERT INTO acc_accounts (code, name, account_type, account_subtype) VALUES ('5010', 'Credit Card Interest Expense', 'expense', 'interest') RETURNING id`
      );
      interestAccountId = created.rows[0].id;
    } else {
      interestAccountId = interestAccount.rows[0].id;
    }

    const txn = await transactionsService.createTransaction(
      {
        transaction_date: statement_date || new Date().toISOString().split('T')[0],
        transaction_type: 'credit_card_charge',
        amount: academy_interest_share,
        debit_account_id: interestAccountId,
        credit_account_id: account_id,
        description: `Monthly interest (Academy share) - Statement dated ${statement_date || 'N/A'}`,
      },
      req.user.id,
      null
    );

    await query(
      `INSERT INTO acc_card_statements
         (account_id, statement_date, statement_file_url, total_statement_interest,
          total_statement_outstanding, academy_used_amount, academy_interest_share,
          transaction_id, raw_ai_response, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [account_id, statement_date || null, null, total_interest_charged || null,
       total_statement_amount || null, academy_used_amount || null, academy_interest_share,
       txn.id, JSON.stringify(raw_ai_response || {}), req.user.id]
    );

    res.json({ success: true, data: txn, message: 'Interest entry created successfully' });
  } catch (err) { next(err); }
};

module.exports = { analyzeStatement, confirmStatement };