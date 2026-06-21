const { query } = require('../../config/database');
const transactionsService = require('../accounting/transactions.service');

// ===== Salary Components (per-employee allowance/deduction) =====

const getEmployeeComponents = async (employeeId) => {
  const result = await query(
    `SELECT * FROM hr_salary_components WHERE employee_id = $1 AND is_active = TRUE ORDER BY type, created_at`,
    [employeeId]
  );
  return result.rows;
};

const addComponent = async (employeeId, data) => {
  const { type, name, amount } = data;
  if (!['allowance', 'deduction'].includes(type)) throw { statusCode: 400, message: 'ভুল component type' };
  if (!name || amount === undefined) throw { statusCode: 400, message: 'নাম ও পরিমাণ দিন' };
  const result = await query(
    `INSERT INTO hr_salary_components (employee_id, type, name, amount) VALUES ($1,$2,$3,$4) RETURNING *`,
    [employeeId, type, name, amount]
  );
  return result.rows[0];
};

const removeComponent = async (id) => {
  await query(`UPDATE hr_salary_components SET is_active = FALSE WHERE id = $1`, [id]);
};

// ===== Payroll Settings =====

const getSettings = async () => {
  const result = await query(`SELECT * FROM hr_payroll_settings WHERE is_active = TRUE LIMIT 1`);
  return result.rows[0];
};

const updateSettings = async (data) => {
  const { run_day, salary_expense_account_id, payment_account_id } = data;
  const result = await query(
    `UPDATE hr_payroll_settings SET
       run_day = COALESCE($1, run_day),
       salary_expense_account_id = COALESCE($2, salary_expense_account_id),
       payment_account_id = COALESCE($3, payment_account_id),
       updated_at = NOW()
     WHERE is_active = TRUE RETURNING *`,
    [run_day, salary_expense_account_id || null, payment_account_id || null]
  );
  return result.rows[0];
};

// ===== Payroll Generation =====

const calculateUnpaidLeaveDeduction = async (employeeId, month, year, dailyRate) => {
  // Find approved unpaid-leave applications overlapping this month
  const result = await query(
    `SELECT COALESCE(SUM(COALESCE(la.modified_duration_days, la.duration_days)), 0) as total_days
     FROM hr_leave_applications la
     JOIN hr_leave_types lt ON lt.id = la.leave_type_id
     WHERE la.employee_id = $1 AND la.status = 'approved' AND lt.is_paid = FALSE
       AND EXTRACT(MONTH FROM la.start_date) = $2 AND EXTRACT(YEAR FROM la.start_date) = $3`,
    [employeeId, month, year]
  );
  const days = parseFloat(result.rows[0].total_days) || 0;
  return { days, deduction: days * dailyRate };
};

const generatePayrollForMonth = async (month, year) => {
  // Only full-time employees, excluding super_admin
  const employeesResult = await query(
    `SELECT he.id, he.basic_salary
     FROM hr_employees he
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE he.employment_type = 'full_time' AND he.status = 'active'
       AND r.name IS DISTINCT FROM 'super_admin'`
  );

  const created = [];

  for (const emp of employeesResult.rows) {
    const existing = await query(
      `SELECT id FROM hr_payroll_runs WHERE employee_id = $1 AND month = $2 AND year = $3`,
      [emp.id, month, year]
    );
    if (existing.rows.length > 0) continue; // already generated, skip

    const basicSalary = parseFloat(emp.basic_salary) || 0;
    const dailyRate = basicSalary / 30;

    const components = await getEmployeeComponents(emp.id);
    const totalAllowances = components.filter(c => c.type === 'allowance').reduce((s, c) => s + parseFloat(c.amount), 0);
    const totalDeductions = components.filter(c => c.type === 'deduction').reduce((s, c) => s + parseFloat(c.amount), 0);

    const { days: unpaidDays, deduction: unpaidDeduction } = await calculateUnpaidLeaveDeduction(emp.id, month, year, dailyRate);

    const netPayable = basicSalary + totalAllowances - totalDeductions - unpaidDeduction;

    const result = await query(
      `INSERT INTO hr_payroll_runs
         (employee_id, month, year, basic_salary, total_allowances, total_deductions,
          unpaid_leave_days, unpaid_leave_deduction, net_payable, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_review') RETURNING *`,
      [emp.id, month, year, basicSalary, totalAllowances, totalDeductions, unpaidDays, unpaidDeduction, netPayable]
    );
    created.push(result.rows[0]);
  }

  return created;
};

// ===== Payroll Listing & Approval =====

const getPayrollRuns = async (month, year) => {
  const result = await query(
    `SELECT pr.*, he.full_name, he.designation, he.department, he.phone
     FROM hr_payroll_runs pr
     JOIN hr_employees he ON he.id = pr.employee_id
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE pr.month = $1 AND pr.year = $2 AND r.name IS DISTINCT FROM 'super_admin'
     ORDER BY he.full_name ASC`,
    [month, year]
  );
  return result.rows;
};

const approvePayrollRun = async (id, approvedByEmployeeId, createdByUserId) => {
  const runResult = await query('SELECT * FROM hr_payroll_runs WHERE id = $1', [id]);
  if (runResult.rows.length === 0) throw { statusCode: 404, message: 'Payroll record পাওয়া যায়নি' };
  const run = runResult.rows[0];

  if (run.status !== 'pending_review') {
    throw { statusCode: 400, message: 'এই payroll ইতিমধ্যে প্রক্রিয়া হয়েছে' };
  }

  const settings = await getSettings();
  if (!settings?.salary_expense_account_id || !settings?.payment_account_id) {
    throw { statusCode: 400, message: 'Payroll Settings-এ Salary Expense ও Payment account সেট করুন' };
  }

  // Create the accounting transaction
  const transactionDate = new Date(run.year, run.month - 1, 1).toISOString().split('T')[0];
  const empNameResult = await query('SELECT full_name FROM hr_employees WHERE id = $1', [run.employee_id]);

  const txn = await transactionsService.createTransaction({
    transaction_date: transactionDate,
    transaction_type: 'expense',
    description: `Salary Payment - ${empNameResult.rows[0]?.full_name || ''} (${run.month}/${run.year})`,
    amount: run.net_payable,
    debit_account_id: settings.salary_expense_account_id,
    credit_account_id: settings.payment_account_id,
    employee_id: null,
  }, createdByUserId, null);

  const result = await query(
    `UPDATE hr_payroll_runs SET
       status = 'approved', approved_by = $1, approved_at = NOW(), accounting_transaction_id = $2
     WHERE id = $3 RETURNING *`,
    [approvedByEmployeeId, txn.id, id]
  );
  return result.rows[0];
};

module.exports = {
  getEmployeeComponents, addComponent, removeComponent,
  getSettings, updateSettings,
  generatePayrollForMonth, getPayrollRuns, approvePayrollRun,
};