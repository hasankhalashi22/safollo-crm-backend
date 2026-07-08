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
       DATE(p.created_at) as date,
       p.payment_method,
       COUNT(*) as count,
       COALESCE(SUM(p.amount), 0) as total
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.approval_status = 'approved' AND e.approval_status = 'approved'
       ${date_from ? `AND DATE(p.created_at) >= $1` : ''}
       ${date_to ? `AND DATE(p.created_at) <= ${date_from ? '$2' : '$1'}` : ''}
     GROUP BY DATE(p.created_at), p.payment_method
     ORDER BY date DESC, p.payment_method`,
    [date_from, date_to].filter(Boolean)
  );

  // 2. Accounting: crm_sync transactions grouped by date + debit account (exclude AR debits)
  const arAccount = await query(`SELECT id FROM acc_accounts WHERE name = 'Accounts Receivable'`);
  const arAccountId = arAccount.rows[0]?.id;

  const accResult = await query(
    `SELECT
       t.transaction_date as date,
       a.name as account_name,
       COUNT(*) as count,
       COALESCE(SUM(t.amount), 0) as total
     FROM acc_transactions t
     JOIN acc_accounts a ON a.id = t.debit_account_id
     WHERE t.source = 'crm_sync' AND t.transaction_type = 'revenue'
       AND t.debit_account_id != $1
       ${date_from ? `AND t.transaction_date >= $2` : ''}
       ${date_to ? `AND t.transaction_date <= ${date_from ? '$3' : '$2'}` : ''}
     GROUP BY t.transaction_date, a.name
     ORDER BY t.transaction_date DESC, a.name`,
    [arAccountId, date_from, date_to].filter(Boolean)
  );

  // 3. Merge payment reconciliation by date + method
  const crmMap = {};
  for (const row of crmResult.rows) {
    const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
    const key = `${d}__${row.payment_method}`;
    crmMap[key] = { date: d, method: row.payment_method, crm_count: Number(row.count), crm_total: Number(row.total) };
  }

  const accMap = {};
  const ACCOUNT_TO_METHOD = Object.fromEntries(Object.entries(METHOD_TO_ACCOUNT).map(([k, v]) => [v, k]));
  for (const row of accResult.rows) {
    const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
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

  // 4. AR vs CRM dues reconciliation (per enrollment)
  const arRows = await query(
    `SELECT
       e.id as enrollment_id,
       s.name as student_name,
       s.phone as student_phone,
       c.name as course_name,
       e.course_price,
       e.total_collected,
       (e.course_price - e.total_collected) as crm_due,
       COALESCE((
         SELECT SUM(CASE WHEN t.debit_account_id = $1 THEN t.amount ELSE -t.amount END)
         FROM acc_transactions t
         WHERE t.enrollment_id = e.id
           AND t.source = 'crm_sync'
           AND (t.debit_account_id = $1 OR t.credit_account_id = $1)
       ), 0) as acc_ar_balance
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     JOIN courses c ON c.id = e.course_id
     WHERE e.approval_status = 'approved'
       AND e.payment_status IN ('due', 'partial')
       ${date_from ? `AND DATE(e.approved_at) >= $2` : ''}
       ${date_to ? `AND DATE(e.approved_at) <= ${date_from ? '$3' : '$2'}` : ''}
     ORDER BY e.approved_at DESC`,
    [arAccountId, date_from, date_to].filter(Boolean)
  );

  const arReconciliation = arRows.rows.map(r => ({
    enrollment_id: r.enrollment_id,
    student_name: r.student_name,
    student_phone: r.student_phone,
    course_name: r.course_name,
    course_price: Number(r.course_price),
    total_collected: Number(r.total_collected),
    crm_due: Number(r.crm_due),
    acc_ar_balance: Number(r.acc_ar_balance),
    diff: Number(r.crm_due) - Number(r.acc_ar_balance),
    matched: Math.abs(Number(r.crm_due) - Number(r.acc_ar_balance)) < 0.01,
  }));

  const arSummary = {
    total_crm_due: arReconciliation.reduce((s, r) => s + r.crm_due, 0),
    total_acc_ar: arReconciliation.reduce((s, r) => s + r.acc_ar_balance, 0),
    mismatch_count: arReconciliation.filter(r => !r.matched).length,
    matched_count: arReconciliation.filter(r => r.matched).length,
  };

  return { rows, summary, arReconciliation, arSummary };
};

module.exports = { getReconciliation };
