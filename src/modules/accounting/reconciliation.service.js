const { query } = require('../../config/database');

const METHOD_TO_ACCOUNT = {
  bkash: 'bKash Wallet',
  nagad: 'Nagad Wallet',
  rocket: 'Rocket Wallet',
  cash: 'Petty Cash',
  cod: 'Steadfast Wallet',
};

const getReconciliation = async ({ date_from, date_to }) => {
  // 1. CRM: approved payments grouped by date + method
  const crmResult = await query(
    `SELECT
       DATE(p.created_at AT TIME ZONE 'Asia/Dhaka') as date,
       p.payment_method,
       COUNT(*) as count,
       COALESCE(SUM(p.amount), 0) as total
     FROM payments p
     WHERE p.approval_status = 'approved'
       ${date_from ? `AND DATE(p.created_at AT TIME ZONE 'Asia/Dhaka') >= $1` : ''}
       ${date_to ? `AND DATE(p.created_at AT TIME ZONE 'Asia/Dhaka') <= ${date_from ? '$2' : '$1'}` : ''}
     GROUP BY DATE(p.created_at AT TIME ZONE 'Asia/Dhaka'), p.payment_method
     ORDER BY date DESC, p.payment_method`,
    [date_from, date_to].filter(Boolean)
  );

  // 2. Accounting: crm_sync transactions grouped by date + debit account
  const accResult = await query(
    `SELECT
       t.transaction_date as date,
       a.name as account_name,
       COUNT(*) as count,
       COALESCE(SUM(t.amount), 0) as total
     FROM acc_transactions t
     JOIN acc_accounts a ON a.id = t.debit_account_id
     WHERE t.source = 'crm_sync' AND t.transaction_type = 'revenue'
       ${date_from ? `AND t.transaction_date >= $1` : ''}
       ${date_to ? `AND t.transaction_date <= ${date_from ? '$2' : '$1'}` : ''}
     GROUP BY t.transaction_date, a.name
     ORDER BY t.transaction_date DESC, a.name`,
    [date_from, date_to].filter(Boolean)
  );

  // 3. Merge by date + method
  const crmMap = {};
  for (const row of crmResult.rows) {
    const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date;
    const key = `${d}__${row.payment_method}`;
    crmMap[key] = { date: d, method: row.payment_method, crm_count: Number(row.count), crm_total: Number(row.total) };
  }

  const accMap = {};
  const ACCOUNT_TO_METHOD = Object.fromEntries(Object.entries(METHOD_TO_ACCOUNT).map(([k, v]) => [v, k]));
  for (const row of accResult.rows) {
    const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date;
    const method = ACCOUNT_TO_METHOD[row.account_name] || row.account_name;
    const key = `${d}__${method}`;
    accMap[key] = { date: d, method, acc_count: Number(row.count), acc_total: Number(row.total) };
  }

  const allKeys = new Set([...Object.keys(crmMap), ...Object.keys(accMap)]);
  const rows = [];
  for (const key of allKeys) {
    const crm = crmMap[key] || {};
    const acc = accMap[key] || {};
    const crm_total = crm.crm_total || 0;
    const acc_total = acc.acc_total || 0;
    const diff = crm_total - acc_total;
    rows.push({
      date: crm.date || acc.date,
      method: crm.method || acc.method,
      crm_count: crm.crm_count || 0,
      crm_total,
      acc_count: acc.acc_count || 0,
      acc_total,
      diff,
      matched: Math.abs(diff) < 0.01,
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.method.localeCompare(b.method));

  const summary = {
    total_crm: rows.reduce((s, r) => s + r.crm_total, 0),
    total_acc: rows.reduce((s, r) => s + r.acc_total, 0),
    mismatch_count: rows.filter(r => !r.matched).length,
    matched_count: rows.filter(r => r.matched).length,
  };

  return { rows, summary };
};

module.exports = { getReconciliation };
