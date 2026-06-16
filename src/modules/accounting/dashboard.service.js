const { query } = require('../../config/database');
const settlementService = require('./settlement.service');

const getDashboard = async () => {
  // Today's and this month's cash in/out
  const summaryResult = await query(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'revenue' AND transaction_date = CURRENT_DATE THEN amount ELSE 0 END), 0) as today_in,
      COALESCE(SUM(CASE WHEN transaction_type = 'expense' AND transaction_date = CURRENT_DATE THEN amount ELSE 0 END), 0) as today_out,
      COALESCE(SUM(CASE WHEN transaction_type = 'revenue' AND date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE) THEN amount ELSE 0 END), 0) as month_in,
      COALESCE(SUM(CASE WHEN transaction_type = 'expense' AND date_trunc('month', transaction_date) = date_trunc('month', CURRENT_DATE) THEN amount ELSE 0 END), 0) as month_out
    FROM acc_transactions
  `);

  // Account balances grouped by type
  const balancesResult = await query(`
    SELECT
      a.id, a.code, a.name, a.account_type, a.account_subtype, a.bank_name,
      COALESCE(SUM(CASE WHEN je.entry_type = 'debit' THEN je.amount ELSE 0 END), 0) as total_debit,
      COALESCE(SUM(CASE WHEN je.entry_type = 'credit' THEN je.amount ELSE 0 END), 0) as total_credit
    FROM acc_accounts a
    LEFT JOIN acc_journal_entries je ON je.account_id = a.id
    WHERE a.is_active = TRUE
    GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype, a.bank_name
    ORDER BY a.code
  `);

  const balances = balancesResult.rows.map(row => {
    const debit = parseFloat(row.total_debit);
    const credit = parseFloat(row.total_credit);
    let balance;
    if (['asset', 'expense'].includes(row.account_type)) {
      balance = debit - credit;
    } else {
      balance = credit - debit;
    }
    return { ...row, balance };
  });

  const assets = balances.filter(b => b.account_type === 'asset');
  const liabilities = balances.filter(b => b.account_type === 'liability');

  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);

  // Recent transactions
  const recentResult = await query(`
    SELECT t.*, da.name as debit_account_name, ca.name as credit_account_name
    FROM acc_transactions t
    LEFT JOIN acc_accounts da ON da.id = t.debit_account_id
    LEFT JOIN acc_accounts ca ON ca.id = t.credit_account_id
    ORDER BY t.created_at DESC
    LIMIT 5
  `);

  // Today's bKash collection (accounting day: 1AM to 1AM BD time)
  const todayBkash = await settlementService.getTodayBkashTotal();
const todayRocket = await settlementService.getTodayRocketTotal();

  return {
    summary: summaryResult.rows[0],
    assets,
    liabilities,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    recent_transactions: recentResult.rows,
    today_bkash: todayBkash,
    today_rocket: todayRocket,
  };
};

module.exports = { getDashboard };