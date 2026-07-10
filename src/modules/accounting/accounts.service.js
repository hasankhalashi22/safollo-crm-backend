const { query } = require('../../config/database');

const getAccounts = async (accountType = null) => {
  const conditions = ['is_active = TRUE'];
  const params = [];
  if (accountType) {
    conditions.push(`account_type = $1`);
    params.push(accountType);
  }
  const result = await query(
    `SELECT * FROM acc_accounts WHERE ${conditions.join(' AND ')} ORDER BY code`,
    params
  );
  return result.rows;
};

const getAllAccounts = async () => {
  const result = await query(`SELECT * FROM acc_accounts ORDER BY account_type, code`);
  return result.rows;
};

const createAccount = async (data) => {
  const {
    code, name, account_type, account_subtype,
    bank_name, credit_limit, interest_rate,
    investor_name, principal_amount, profit_rate,
    contract_start_date, contract_end_date,
    shareholder_name, share_percentage
  } = data;

  if (account_subtype === 'shareholder' && share_percentage) {
    const existing = await query(
      `SELECT COALESCE(SUM(share_percentage), 0) as total FROM acc_accounts WHERE account_subtype = 'shareholder' AND is_active = TRUE`
    );
    const currentTotal = parseFloat(existing.rows[0].total) || 0;
    if (currentTotal + parseFloat(share_percentage) > 100) {
      throw { statusCode: 400, message: `Total share percentage cannot exceed 100%. Currently allocated: ${currentTotal}%, remaining: ${100 - currentTotal}%` };
    }
  }

  const result = await query(
    `INSERT INTO acc_accounts
       (code, name, account_type, account_subtype, bank_name, credit_limit, interest_rate,
        investor_name, principal_amount, profit_rate, contract_start_date, contract_end_date,
        shareholder_name, share_percentage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [code || null, name, account_type, account_subtype || null,
     bank_name || null, credit_limit || null, interest_rate || null,
     investor_name || null, principal_amount || null, profit_rate || null,
     contract_start_date || null, contract_end_date || null,
     shareholder_name || null, share_percentage || null]
  );
  return result.rows[0];
};
const updateAccount = async (id, data) => {
  if (data.share_percentage !== undefined && data.share_percentage !== null && data.share_percentage !== '') {
    const existing = await query(
      `SELECT COALESCE(SUM(share_percentage), 0) as total FROM acc_accounts WHERE account_subtype = 'shareholder' AND is_active = TRUE AND id != $1`,
      [id]
    );
    const currentTotal = parseFloat(existing.rows[0].total) || 0;
    if (currentTotal + parseFloat(data.share_percentage) > 100) {
      throw { statusCode: 400, message: `Total share percentage cannot exceed 100%. Other shareholders currently hold: ${currentTotal}%, remaining: ${100 - currentTotal}%` };
    }
  }

  const fields = [];
  const params = [];
  let idx = 1;

 const allowedFields = [
    'name', 'account_subtype', 'is_active', 'bank_name', 'credit_limit',
    'interest_rate', 'investor_name', 'principal_amount', 'profit_rate',
    'contract_start_date', 'contract_end_date', 'shareholder_name', 'share_percentage'
  ];

  const numericFields = ['credit_limit', 'interest_rate', 'principal_amount', 'profit_rate', 'share_percentage'];
  const dateFields = ['contract_start_date', 'contract_end_date'];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      let value = data[field];
      if ((numericFields.includes(field) || dateFields.includes(field)) && value === '') {
        value = null;
      }
      fields.push(`${field} = $${idx++}`);
      params.push(value);
    }
  }

  if (fields.length === 0) throw { statusCode: 400, message: 'কোনো তথ্য দেওয়া হয়নি' };
  fields.push(`updated_at = NOW()`);

  const result = await query(
    `UPDATE acc_accounts SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    [...params, id]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'একাউন্ট পাওয়া যায়নি' };
  return result.rows[0];
};

const getAccountBalance = async (accountId) => {
  const result = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) as total_credit
     FROM acc_journal_entries
     WHERE account_id = $1`,
    [accountId]
  );
  const { total_debit, total_credit } = result.rows[0];

  const accountResult = await query('SELECT account_type FROM acc_accounts WHERE id = $1', [accountId]);
  const accountType = accountResult.rows[0]?.account_type;

  let balance;
  if (['asset', 'expense'].includes(accountType)) {
    balance = parseFloat(total_debit) - parseFloat(total_credit);
  } else {
    balance = parseFloat(total_credit) - parseFloat(total_debit);
  }

  return { total_debit, total_credit, balance };
};

const getLedger = async (accountId, dateFrom, dateTo) => {
  const conditions = ['je.account_id = $1'];
  const params = [accountId];
  let idx = 2;

  if (dateFrom) { conditions.push(`je.entry_date >= $${idx++}`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`je.entry_date <= $${idx++}`); params.push(dateTo); }

  const where = conditions.join(' AND ');

  const accountResult = await query('SELECT * FROM acc_accounts WHERE id = $1', [accountId]);
  if (accountResult.rows.length === 0) throw { statusCode: 404, message: 'একাউন্ট পাওয়া যায়নি' };
  const account = accountResult.rows[0];

  // Opening balance (before date_from)
  let openingBalance = 0;
  if (dateFrom) {
    const openingResult = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
         COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) as total_credit
       FROM acc_journal_entries
       WHERE account_id = $1 AND entry_date < $2`,
      [accountId, dateFrom]
    );
    const { total_debit, total_credit } = openingResult.rows[0];
    if (['asset', 'expense'].includes(account.account_type)) {
      openingBalance = parseFloat(total_debit) - parseFloat(total_credit);
    } else {
      openingBalance = parseFloat(total_credit) - parseFloat(total_debit);
    }
  }

  const result = await query(
    `SELECT je.*, t.transaction_date, t.transaction_type, t.description, t.reference_no, t.source, t.proof_url,
            da.name as debit_account_name, ca.name as credit_account_name
     FROM acc_journal_entries je
     JOIN acc_transactions t ON t.id = je.transaction_id
     LEFT JOIN acc_accounts da ON da.id = t.debit_account_id
     LEFT JOIN acc_accounts ca ON ca.id = t.credit_account_id
     WHERE ${where}
     ORDER BY je.entry_date ASC, je.created_at ASC`,
    params
  );

  let runningBalance = openingBalance;
  const entries = result.rows.map(row => {
    const isDebitNormal = ['asset', 'expense'].includes(account.account_type);
    if (isDebitNormal) {
      runningBalance += row.entry_type === 'debit' ? parseFloat(row.amount) : -parseFloat(row.amount);
    } else {
      runningBalance += row.entry_type === 'credit' ? parseFloat(row.amount) : -parseFloat(row.amount);
    }
    return { ...row, running_balance: runningBalance };
  });

  return { account, opening_balance: openingBalance, closing_balance: runningBalance, entries };
};

const getTrialBalance = async (asOfDate) => {
  const conditions = ['a.is_active = TRUE'];
  const params = [];
  let idx = 1;

  if (asOfDate) {
    conditions.push(`je.entry_date <= $${idx++}`);
    params.push(asOfDate);
  }

  const result = await query(
    `SELECT
       a.id, a.code, a.name, a.account_type,
       COALESCE(SUM(CASE WHEN je.entry_type = 'debit' THEN je.amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN je.entry_type = 'credit' THEN je.amount ELSE 0 END), 0) as total_credit
     FROM acc_accounts a
     LEFT JOIN acc_journal_entries je ON je.account_id = a.id ${asOfDate ? `AND je.entry_date <= $1` : ''}
     WHERE a.is_active = TRUE
     GROUP BY a.id, a.code, a.name, a.account_type
     ORDER BY a.code`,
    params
  );

  const rows = result.rows.map(row => {
    const debit = parseFloat(row.total_debit);
    const credit = parseFloat(row.total_credit);
    let debitBalance = 0, creditBalance = 0;

    if (['asset', 'expense'].includes(row.account_type)) {
      const balance = debit - credit;
      if (balance >= 0) debitBalance = balance; else creditBalance = -balance;
    } else {
      const balance = credit - debit;
      if (balance >= 0) creditBalance = balance; else debitBalance = -balance;
    }

    return { ...row, debit_balance: debitBalance, credit_balance: creditBalance };
  });

  const totalDebit = rows.reduce((sum, r) => sum + r.debit_balance, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.credit_balance, 0);

  return {
    accounts: rows.filter(r => r.debit_balance !== 0 || r.credit_balance !== 0),
    total_debit: totalDebit,
    total_credit: totalCredit,
    is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
};

const getIncomeStatement = async (dateFrom, dateTo) => {
  const conditions = ['a.is_active = TRUE', `a.account_type IN ('revenue', 'expense')`];
  const params = [];
  let idx = 1;
  let dateCondition = '';

  if (dateFrom) { dateCondition += ` AND je.entry_date >= $${idx++}`; params.push(dateFrom); }
  if (dateTo) { dateCondition += ` AND je.entry_date <= $${idx++}`; params.push(dateTo); }

  const result = await query(
    `SELECT
       a.id, a.code, a.name, a.account_type,
       COALESCE(SUM(CASE WHEN je.entry_type = 'debit' THEN je.amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN je.entry_type = 'credit' THEN je.amount ELSE 0 END), 0) as total_credit
     FROM acc_accounts a
     LEFT JOIN acc_journal_entries je ON je.account_id = a.id ${dateCondition}
     WHERE a.is_active = TRUE AND a.account_type IN ('revenue', 'expense')
     GROUP BY a.id, a.code, a.name, a.account_type
     ORDER BY a.code`,
    params
  );

  const revenues = [];
  const expenses = [];

  result.rows.forEach(row => {
    const debit = parseFloat(row.total_debit);
    const credit = parseFloat(row.total_credit);
    let amount;
    if (row.account_type === 'revenue') {
      amount = credit - debit;
      if (amount !== 0) revenues.push({ ...row, amount });
    } else {
      amount = debit - credit;
      if (amount !== 0) expenses.push({ ...row, amount });
    }
  });

  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = expenses.reduce((sum, r) => sum + r.amount, 0);
  const netIncome = totalRevenue - totalExpense;

  return { revenues, expenses, total_revenue: totalRevenue, total_expense: totalExpense, net_income: netIncome };
};

const getBalanceSheet = async (asOfDate) => {
  const conditions = [`a.account_type IN ('asset', 'liability', 'equity')`];
  const params = [];
  let dateCondition = '';

  if (asOfDate) {
    dateCondition = ` AND je.entry_date <= $1`;
    params.push(asOfDate);
  }

  const result = await query(
    `SELECT
       a.id, a.code, a.name, a.account_type, a.account_subtype, a.bank_name,
       COALESCE(SUM(CASE WHEN je.entry_type = 'debit' THEN je.amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN je.entry_type = 'credit' THEN je.amount ELSE 0 END), 0) as total_credit
     FROM acc_accounts a
     LEFT JOIN acc_journal_entries je ON je.account_id = a.id ${dateCondition}
     WHERE a.is_active = TRUE AND a.account_type IN ('asset', 'liability', 'equity')
     GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.bank_name
     ORDER BY a.code`,
    params
  );

  // Net income (revenue - expense) up to this date is added to equity (Retained Earnings)
  let netIncomeCondition = '';
  const niParams = [];
  if (asOfDate) {
    netIncomeCondition = ` AND je.entry_date <= $1`;
    niParams.push(asOfDate);
  }
  const niResult = await query(
    `SELECT
       a.account_type,
       COALESCE(SUM(CASE WHEN je.entry_type = 'debit' THEN je.amount ELSE 0 END), 0) as total_debit,
       COALESCE(SUM(CASE WHEN je.entry_type = 'credit' THEN je.amount ELSE 0 END), 0) as total_credit
     FROM acc_accounts a
     LEFT JOIN acc_journal_entries je ON je.account_id = a.id ${netIncomeCondition}
     WHERE a.is_active = TRUE AND a.account_type IN ('revenue', 'expense')
     GROUP BY a.account_type`,
    niParams
  );

  let totalRevenue = 0, totalExpense = 0;
  niResult.rows.forEach(row => {
    const debit = parseFloat(row.total_debit);
    const credit = parseFloat(row.total_credit);
    if (row.account_type === 'revenue') totalRevenue += (credit - debit);
    else totalExpense += (debit - credit);
  });
  const netIncome = totalRevenue - totalExpense;

  const assets = [];
  const liabilities = [];
  const equity = [];

  result.rows.forEach(row => {
    const debit = parseFloat(row.total_debit);
    const credit = parseFloat(row.total_credit);
    let balance;
    if (row.account_type === 'asset') {
      balance = debit - credit;
      if (balance !== 0) assets.push({ ...row, balance });
    } else if (row.account_type === 'liability') {
      balance = credit - debit;
      if (balance !== 0) liabilities.push({ ...row, balance });
    } else {
      balance = credit - debit;
      if (balance !== 0) equity.push({ ...row, balance });
    }
  });

  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);
  const totalEquityBase = equity.reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = totalEquityBase + netIncome;

  return {
    assets, liabilities, equity,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity_base: totalEquityBase,
    net_income: netIncome,
    total_equity: totalEquity,
    total_liabilities_and_equity: totalLiabilities + totalEquity,
    is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
};

const getCashFlowStatement = async (dateFrom, dateTo) => {
  // Total cash = sum of all "asset" account balances (excluding non-cash assets if any in future)
  const getCashBalance = async (asOfDate) => {
    const params = [];
    let dateCondition = '';
    if (asOfDate) {
      dateCondition = ` AND je.entry_date <= $1`;
      params.push(asOfDate);
    }
    const result = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN je.entry_type = 'debit' THEN je.amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN je.entry_type = 'credit' THEN je.amount ELSE 0 END), 0) as balance
       FROM acc_accounts a
       LEFT JOIN acc_journal_entries je ON je.account_id = a.id ${dateCondition}
       WHERE a.is_active = TRUE AND a.account_type = 'asset'`,
      params
    );
    return parseFloat(result.rows[0].balance) || 0;
  };

  // Day before dateFrom for opening balance
  let openingDate = null;
  if (dateFrom) {
    const d = new Date(dateFrom);
    d.setDate(d.getDate() - 1);
    openingDate = d.toISOString().split('T')[0];
  }

  const beginningCash = dateFrom ? await getCashBalance(openingDate) : 0;
  const endingCash = await getCashBalance(dateTo);

  // Transactions grouped by type within period
  const conditions = [];
  const params = [];
  let idx = 1;
  if (dateFrom) { conditions.push(`t.transaction_date >= $${idx++}`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`t.transaction_date <= $${idx++}`); params.push(dateTo); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT t.transaction_type,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'revenue' THEN t.amount ELSE 0 END), 0) as revenue,
            COALESCE(SUM(CASE WHEN t.transaction_type != 'revenue' THEN t.amount ELSE 0 END), 0) as outflow
     FROM acc_transactions t
     ${where}
     GROUP BY t.transaction_type`,
    params
  );

  let operatingIn = 0, operatingOut = 0, financingOut = 0, investingOut = 0;
  const operatingItems = [];
  const financingItems = [];

  const OPERATING_TYPES = ['revenue', 'expense', 'salary_payment', 'teacher_payment', 'steadfast_withdrawal'];
  const FINANCING_TYPES = ['investor_payment', 'credit_card_payment'];

  result.rows.forEach(row => {
    const type = row.transaction_type;
    const revenue = parseFloat(row.revenue);
    const outflow = parseFloat(row.outflow);

  if (type === 'revenue') {
      operatingIn += revenue;
      operatingItems.push({ label: 'Cash from Sales', amount: revenue, type: 'in' });
    } else if (OPERATING_TYPES.includes(type)) {
      operatingOut += outflow;
      operatingItems.push({ label: TYPE_LABELS_EN[type] || type, amount: -outflow, type: 'out' });
    } else if (FINANCING_TYPES.includes(type)) {
      financingOut += outflow;
      financingItems.push({ label: TYPE_LABELS_EN[type] || type, amount: -outflow, type: 'out' });
    }
    // fund_transfer, adjusting_entry, bank_withdrawal -> excluded (cash-to-cash, no net effect)
  });

  const netOperating = operatingIn - operatingOut;
  const netFinancing = -financingOut;
  const netInvesting = -investingOut;
  const netChange = netOperating + netFinancing + netInvesting;

  return {
    operating_items: operatingItems,
    financing_items: financingItems,
    net_operating: netOperating,
    net_financing: netFinancing,
    net_investing: netInvesting,
    net_change: netChange,
    beginning_cash: beginningCash,
    ending_cash: endingCash,
  };
};

const TYPE_LABELS_EN = {
  expense: 'Expense',
  salary_payment: 'Salary Payment',
  teacher_payment: 'Teacher Payment',
  steadfast_withdrawal: 'Steadfast Withdrawal',
  investor_payment: 'Investor Payment',
  credit_card_payment: 'Credit Card Payment',
};

const getEquityStatement = async (dateFrom, dateTo) => {
  // Helper: get balance of equity accounts (excluding retained earnings logic) as of a date
  const getEquityAccountBalances = async (asOfDate) => {
    const params = [];
    let dateCondition = '';
    if (asOfDate) {
      dateCondition = ` AND je.entry_date <= $1`;
      params.push(asOfDate);
    }
    const result = await query(
      `SELECT a.id, a.name,
              COALESCE(SUM(CASE WHEN je.entry_type = 'credit' THEN je.amount ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN je.entry_type = 'debit' THEN je.amount ELSE 0 END), 0) as balance
       FROM acc_accounts a
       LEFT JOIN acc_journal_entries je ON je.account_id = a.id ${dateCondition}
       WHERE a.is_active = TRUE AND a.account_type = 'equity'
       GROUP BY a.id, a.name
       ORDER BY a.code`,
      params
    );
    return result.rows.map(r => ({ id: r.id, name: r.name, balance: parseFloat(r.balance) }));
  };

  // Helper: get cumulative net income (revenue - expense) up to a date
  const getNetIncome = async (dateFrom, dateTo) => {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (dateFrom) { conditions.push(`je.entry_date >= $${idx++}`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`je.entry_date <= $${idx++}`); params.push(dateTo); }
    const where = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT a.account_type,
              COALESCE(SUM(CASE WHEN je.entry_type = 'debit' THEN je.amount ELSE 0 END), 0) as total_debit,
              COALESCE(SUM(CASE WHEN je.entry_type = 'credit' THEN je.amount ELSE 0 END), 0) as total_credit
       FROM acc_accounts a
       LEFT JOIN acc_journal_entries je ON je.account_id = a.id ${where}
       WHERE a.is_active = TRUE AND a.account_type IN ('revenue', 'expense')
       GROUP BY a.account_type`,
      params
    );

    let revenue = 0, expense = 0;
    result.rows.forEach(row => {
      const debit = parseFloat(row.total_debit);
      const credit = parseFloat(row.total_credit);
      if (row.account_type === 'revenue') revenue += (credit - debit);
      else expense += (debit - credit);
    });
    return revenue - expense;
  };

  // Beginning date = day before dateFrom
  let beginningDate = null;
  if (dateFrom) {
    const d = new Date(dateFrom);
    d.setDate(d.getDate() - 1);
    beginningDate = d.toISOString().split('T')[0];
  }

  const beginningEquityAccounts = await getEquityAccountBalances(beginningDate);
  const endingEquityAccounts = await getEquityAccountBalances(dateTo);

  const beginningRetainedEarnings = dateFrom ? await getNetIncome(null, beginningDate) : 0;
  const netIncomePeriod = await getNetIncome(dateFrom, dateTo);
  const endingRetainedEarnings = beginningRetainedEarnings + netIncomePeriod;

  const beginningOtherEquity = beginningEquityAccounts.reduce((sum, a) => sum + a.balance, 0);
  const endingOtherEquity = endingEquityAccounts.reduce((sum, a) => sum + a.balance, 0);
  const equityChanges = endingOtherEquity - beginningOtherEquity;

  const beginningTotalEquity = beginningOtherEquity + beginningRetainedEarnings;
  const endingTotalEquity = endingOtherEquity + endingRetainedEarnings;

  // Per-account changes (e.g. Owner Equity contributions/withdrawals)
  const accountChanges = endingEquityAccounts.map(end => {
    const begin = beginningEquityAccounts.find(b => b.id === end.id);
    return {
      name: end.name,
      beginning: begin ? begin.balance : 0,
      change: end.balance - (begin ? begin.balance : 0),
      ending: end.balance,
    };
  });

  return {
    beginning_total_equity: beginningTotalEquity,
    beginning_retained_earnings: beginningRetainedEarnings,
    beginning_other_equity: beginningOtherEquity,
    net_income_period: netIncomePeriod,
    equity_account_changes: accountChanges,
    ending_retained_earnings: endingRetainedEarnings,
    ending_other_equity: endingOtherEquity,
    ending_total_equity: endingTotalEquity,
  };
};

const getCreditCardsOverview = async () => {
  const result = await query(
    `SELECT id, code, name, bank_name, credit_limit, interest_rate, usd_outstanding
     FROM acc_accounts
     WHERE is_active = TRUE AND account_subtype = 'credit_card'
     ORDER BY code`
  );

  const cards = [];
  for (const card of result.rows) {
    const summaryResult = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) as total_used,
         COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0) as total_paid
       FROM acc_journal_entries
       WHERE account_id = $1`,
      [card.id]
    );
    const totalCreditUsed = parseFloat(summaryResult.rows[0].total_used) || 0;
    const totalPaid = parseFloat(summaryResult.rows[0].total_paid) || 0;
    const outstandingBalance = totalCreditUsed - totalPaid;

    cards.push({
      id: card.id,
      code: card.code,
      name: card.name,
      bank_name: card.bank_name,
      credit_limit: parseFloat(card.credit_limit) || 0,
      interest_rate: card.interest_rate,
      total_credit_used: totalCreditUsed,
      total_paid: totalPaid,
      outstanding_balance: outstandingBalance,
      usd_outstanding: parseFloat(card.usd_outstanding) || 0,
    });
  }

  const totals = cards.reduce((acc, c) => ({
    total_credit_used: acc.total_credit_used + c.total_credit_used,
    total_paid: acc.total_paid + c.total_paid,
    outstanding_balance: acc.outstanding_balance + c.outstanding_balance,
  }), { total_credit_used: 0, total_paid: 0, outstanding_balance: 0 });

  return { cards, totals };
};
const getInvestorsOverview = async () => {
  const result = await query(
    `SELECT id, name, investor_name, principal_amount, profit_rate, contract_start_date, contract_end_date, is_accruing
     FROM acc_accounts
     WHERE account_subtype = 'investor_loan'
     ORDER BY code`
  );

  const investors = [];
  for (const inv of result.rows) {
    // Current principal balance (liability: credit - debit)
    const balanceResult = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0) as balance
       FROM acc_journal_entries
       WHERE account_id = $1`,
      [inv.id]
    );
    const currentPrincipal = parseFloat(balanceResult.rows[0].balance) || 0;

    // Last profit payment date (transactions with related_account_id = this investor, type = investor_profit_payment)
    const lastPaymentResult = await query(
      `SELECT MAX(transaction_date) as last_date, COALESCE(SUM(amount), 0) as total_paid
       FROM acc_transactions
       WHERE related_account_id = $1 AND transaction_type = 'investor_profit_payment'`,
      [inv.id]
    );
    const lastPaymentDate = lastPaymentResult.rows[0].last_date;
    const totalPaid = parseFloat(lastPaymentResult.rows[0].total_paid) || 0;

    // Initial investment = total deposits (credit entries from Cash In)
    const depositResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_deposit
       FROM acc_journal_entries
       WHERE account_id = $1 AND entry_type = 'credit'`,
      [inv.id]
    );
    const totalDeposit = parseFloat(depositResult.rows[0].total_deposit) || 0;

    // Total principal repaid (debit entries via Cash Out, excluding profit payments which don't touch this account)
    const repaidResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_repaid
       FROM acc_journal_entries
       WHERE account_id = $1 AND entry_type = 'debit'`,
      [inv.id]
    );
    const totalRepaid = parseFloat(repaidResult.rows[0].total_repaid) || 0;

    // If no journal entries exist, fall back to principal_amount from account setup
    const principalFromAccount = parseFloat(inv.principal_amount) || 0;
    const effectiveInitialInvestment = totalDeposit > 0 ? totalDeposit : principalFromAccount;
    const effectivePrincipal = totalDeposit > 0 ? currentPrincipal : Math.max(0, principalFromAccount - totalRepaid);

    // Accrual start date = last payment date, or contract start date, or account creation
    const accrualStart = lastPaymentDate || inv.contract_start_date;

   let accruedProfit = 0;
    let daysAccrued = 0;
    if (inv.is_accruing && accrualStart && inv.profit_rate && effectivePrincipal > 0) {
      const start = new Date(accrualStart);
      const end = new Date(); // always accrue up to today while toggle is ON, regardless of contract_end_date
      daysAccrued = Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
      accruedProfit = effectivePrincipal * (parseFloat(inv.profit_rate) / 100) * (daysAccrued / 365);
    }

   investors.push({
      id: inv.id,
      name: inv.name,
      investor_name: inv.investor_name,
      principal: effectivePrincipal,
      profit_rate: inv.profit_rate,
      contract_start_date: inv.contract_start_date,
      contract_end_date: inv.contract_end_date,
      last_payment_date: lastPaymentDate,
      days_accrued: daysAccrued,
      accrued_profit: Math.round(accruedProfit * 100) / 100,
      total_profit_paid: totalPaid,
      is_accruing: inv.is_accruing,
      initial_investment: effectiveInitialInvestment,
      total_principal_repaid: totalRepaid,
    });
  }

const totals = investors.reduce((acc, inv) => ({
    total_principal: acc.total_principal + inv.principal,
    total_accrued: acc.total_accrued + inv.accrued_profit,
    total_paid: acc.total_paid + inv.total_profit_paid,
    total_invested: acc.total_invested + inv.initial_investment,
    total_repaid: acc.total_repaid + inv.total_principal_repaid,
  }), { total_principal: 0, total_accrued: 0, total_paid: 0, total_invested: 0, total_repaid: 0 });

  return { investors, totals };
};

const toggleInvestorAccrual = async (id, isAccruing) => {
  const result = await query(
    `UPDATE acc_accounts SET is_accruing = $1, updated_at = NOW() WHERE id = $2 AND account_subtype = 'investor_loan' RETURNING *`,
    [isAccruing, id]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Investor account not found' };
  return result.rows[0];
};

const getInvestorHistory = async (investorId) => {
  // Principal-related entries (deposits/repayments) - journal entries on this account
  const principalResult = await query(
    `SELECT je.id, je.entry_date, je.entry_type, je.amount, t.description, t.proof_url, 'principal' as kind
     FROM acc_journal_entries je
     JOIN acc_transactions t ON t.id = je.transaction_id
     WHERE je.account_id = $1
     ORDER BY je.entry_date ASC, je.created_at ASC`,
    [investorId]
  );

  // Profit payments - transactions linked via related_account_id
  const profitResult = await query(
    `SELECT t.id, t.transaction_date as entry_date, 'debit' as entry_type, t.amount, t.description, t.proof_url, 'profit' as kind
     FROM acc_transactions t
     WHERE t.related_account_id = $1 AND t.transaction_type = 'investor_profit_payment'
     ORDER BY t.transaction_date ASC, t.created_at ASC`,
    [investorId]
  );

  const combined = [...principalResult.rows, ...profitResult.rows].sort((a, b) =>
    new Date(a.entry_date) - new Date(b.entry_date)
  );

  return { entries: combined };
};

const getShareholdersOverview = async () => {
  const result = await query(
    `SELECT id, name, shareholder_name, share_percentage
     FROM acc_accounts
     WHERE is_active = TRUE AND account_subtype = 'shareholder'
     ORDER BY code`
  );

  const shareholders = [];
  for (const sh of result.rows) {
    // Total profit received (debit entries on this equity account = withdrawal)
    const receivedResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_received
       FROM acc_journal_entries
       WHERE account_id = $1 AND entry_type = 'debit'`,
      [sh.id]
    );
    const totalReceived = parseFloat(receivedResult.rows[0].total_received) || 0;

    shareholders.push({
      id: sh.id,
      name: sh.name,
      shareholder_name: sh.shareholder_name,
      share_percentage: sh.share_percentage,
      total_profit_received: totalReceived,
    });
  }

  const totalPercentage = shareholders.reduce((sum, s) => sum + parseFloat(s.share_percentage || 0), 0);
  const totalDistributed = shareholders.reduce((sum, s) => sum + s.total_profit_received, 0);

  return { shareholders, total_percentage: totalPercentage, total_distributed: totalDistributed };
};

const getGeneralJournal = async (dateFrom, dateTo) => {
  const conditions = [];
  const params = [];
  let idx = 1;
  if (dateFrom) { conditions.push(`je.entry_date >= $${idx++}`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`je.entry_date <= $${idx++}`); params.push(dateTo); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT je.id, je.entry_date, je.entry_type, je.amount,
            t.id as transaction_id, t.transaction_type, t.description, t.reference_no, t.source,
            a.name as account_name, a.code as account_code
     FROM acc_journal_entries je
     JOIN acc_transactions t ON t.id = je.transaction_id
     JOIN acc_accounts a ON a.id = je.account_id
     ${where}
     ORDER BY je.entry_date DESC, t.created_at DESC, je.entry_type ASC`,
    params
  );

  return { entries: result.rows };
};


const setOpeningBalance = async (id, amount, usdAmount, createdBy) => {
  const accountResult = await query(`SELECT id, name, account_subtype FROM acc_accounts WHERE id = $1`, [id]);
  if (accountResult.rows.length === 0) throw { statusCode: 404, message: 'একাউন্ট পাওয়া যায়নি' };
  const account = accountResult.rows[0];
  if (account.account_subtype !== 'credit_card') throw { statusCode: 400, message: 'শুধু credit card একাউন্টে opening balance সেট করা যাবে' };

  // Find or create Opening Balance Equity account
  let equityResult = await query(`SELECT id FROM acc_accounts WHERE account_type = 'equity' AND name ILIKE '%opening%' LIMIT 1`);
  let equityAccountId;
  if (equityResult.rows.length === 0) {
    const created = await query(
      `INSERT INTO acc_accounts (name, account_type, account_subtype, is_active) VALUES ('Opening Balance Equity', 'equity', null, true) RETURNING id`
    );
    equityAccountId = created.rows[0].id;
  } else {
    equityAccountId = equityResult.rows[0].id;
  }

  // Delete existing journal entries and their orphaned transactions for this account
  const jeResult = await query(`SELECT DISTINCT transaction_id FROM acc_journal_entries WHERE account_id = $1`, [id]);
  const txnIds = jeResult.rows.map(r => r.transaction_id);

  await query(`DELETE FROM acc_journal_entries WHERE account_id = $1`, [id]);

  // Delete transactions that now have no journal entries
  if (txnIds.length > 0) {
    await query(
      `DELETE FROM acc_transactions WHERE id = ANY($1) AND id NOT IN (SELECT DISTINCT transaction_id FROM acc_journal_entries)`,
      [txnIds]
    );
  }

  // Set USD opening balance on account
  const usdVal = parseFloat(usdAmount) || 0;
  await query(`UPDATE acc_accounts SET usd_outstanding = $1 WHERE id = $2`, [usdVal, id]);

  if (amount <= 0) return { success: true, message: 'পুরনো ডাটা মুছে ফেলা হয়েছে' };

  // Create opening balance transaction: DR Opening Balance Equity, CR Credit Card
  const txnResult = await query(
    `INSERT INTO acc_transactions (transaction_date, transaction_type, description, amount, debit_account_id, credit_account_id, source, created_by)
     VALUES (CURRENT_DATE, 'opening_balance', $1, $2, $3, $4, 'manual', $5) RETURNING id`,
    [`${account.name} — Opening Balance`, amount, equityAccountId, id, createdBy]
  );
  const txnId = txnResult.rows[0].id;

  await query(`INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1, $2, 'debit', $3, CURRENT_DATE)`, [txnId, equityAccountId, amount]);
  await query(`INSERT INTO acc_journal_entries (transaction_id, account_id, entry_type, amount, entry_date) VALUES ($1, $2, 'credit', $3, CURRENT_DATE)`, [txnId, id, amount]);

  return { success: true, message: 'Opening balance সেট হয়েছে' };
};

const deleteAccount = async (id) => {
  const txnCheck = await query(
    `SELECT COUNT(*) as count FROM acc_journal_entries WHERE account_id = $1`,
    [id]
  );
  if (parseInt(txnCheck.rows[0].count) > 0) {
    throw { statusCode: 400, message: 'এই একাউন্টে ট্রানজেকশন আছে। ট্রানজেকশন থাকলে একাউন্ট মুছে ফেলা যাবে না।' };
  }
  const result = await query(`DELETE FROM acc_accounts WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) throw { statusCode: 404, message: 'একাউন্ট পাওয়া যায়নি' };
  return { deleted: true };
};

module.exports = { getAccounts, getAllAccounts, createAccount, updateAccount, deleteAccount, setOpeningBalance, getAccountBalance, getLedger, getTrialBalance, getIncomeStatement, getBalanceSheet, getCashFlowStatement, getEquityStatement, getCreditCardsOverview, getInvestorsOverview, toggleInvestorAccrual, getInvestorHistory, getShareholdersOverview, getGeneralJournal };