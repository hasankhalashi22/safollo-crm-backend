const { query } = require('../../config/database');
const transactionsService = require('../accounting/transactions.service');
const attendanceService = require('../attendance/attendance.service');

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
  const { run_day, close_day, salary_expense_account_id, payment_account_id, salary_payable_account_id } = data;
  const result = await query(
    `UPDATE hr_payroll_settings SET
       run_day = COALESCE($1, run_day),
       close_day = COALESCE($2, close_day),
       salary_expense_account_id = COALESCE($3, salary_expense_account_id),
       payment_account_id = COALESCE($4, payment_account_id),
       salary_payable_account_id = COALESCE($5, salary_payable_account_id),
       updated_at = NOW()
     WHERE is_active = TRUE RETURNING *`,
    [run_day, close_day, salary_expense_account_id || null, payment_account_id || null, salary_payable_account_id || null]
  );
  return result.rows[0];
};


// Calculate working days, paid leave days, office holidays, and extra working days
const calculateWorkingDays = async (employeeId, month, year) => {
  const empResult = await query(
    'SELECT weekly_off_day FROM hr_employees WHERE id = $1',
    [employeeId]
  );
  const weeklyOffDay = empResult.rows[0]?.weekly_off_day;

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Get all days in the month
  const daysInMonth = new Date(year, month, 0).getDate();
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    return { date: d, dayName: dayNames[d.getDay()] };
  });

  // Get actual attendance days (check-in করা দিন)
  const attendanceResult = await query(
    `SELECT date FROM hr_attendance
     WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
     AND check_in_time IS NOT NULL`,
    [employeeId, month, year]
  );
  const attendanceDates = new Set(attendanceResult.rows.map(r => r.date.toISOString().split('T')[0]));

  // Get approved paid leave days
  const paidLeaveResult = await query(
    `SELECT la.start_date, la.end_date, COALESCE(la.modified_start_date, la.start_date) as eff_start,
            COALESCE(la.modified_end_date, la.end_date) as eff_end
     FROM hr_leave_applications la
     JOIN hr_leave_types lt ON lt.id = la.leave_type_id
     WHERE la.employee_id = $1 AND la.status = 'approved' AND lt.is_paid = TRUE
       AND EXTRACT(MONTH FROM la.start_date) = $2 AND EXTRACT(YEAR FROM la.start_date) = $3`,
    [employeeId, month, year]
  );

  const paidLeaveDates = new Set();
  for (const leave of paidLeaveResult.rows) {
    const start = new Date(leave.eff_start);
    const end = new Date(leave.eff_end);
    const current = new Date(start);
    while (current <= end) {
      paidLeaveDates.add(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
  }

  // Get office holidays this month
  const holidayResult = await query(
    `SELECT date FROM hr_office_holidays
     WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
    [month, year]
  );
  const holidayDates = new Set(holidayResult.rows.map(r => r.date.toISOString().split('T')[0]));

  let workingDays = 0;
  let extraWorkingDays = 0;

  for (const { date, dayName } of allDays) {
    const dateStr = date.toISOString().split('T')[0];
    const isWeeklyOff = weeklyOffDay && dayName === weeklyOffDay;
    const isPresent = attendanceDates.has(dateStr);
    const isPaidLeave = paidLeaveDates.has(dateStr);
    const isHoliday = holidayDates.has(dateStr);

    if (isWeeklyOff) {
      if (isPresent) extraWorkingDays++; // কাজ করেছে ছুটির দিনে
      continue;
    }

    // Regular working day
    if (isPresent || isPaidLeave || isHoliday) {
      workingDays++;
    }
  }

  return { workingDays, extraWorkingDays, daysInMonth };
};


// ===== Step 1: Prepare (draft) =====

const calculateUnpaidLeaveDeduction = async (employeeId, month, year, dailyRate) => {
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

const getPreviousDue = async (employeeId, month, year) => {
  // Previous calendar month
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

  const result = await query(
    `SELECT due_amount FROM hr_payroll_runs WHERE employee_id = $1 AND month = $2 AND year = $3`,
    [employeeId, prevMonth, prevYear]
  );
  return result.rows.length > 0 ? parseFloat(result.rows[0].due_amount) || 0 : 0;
};

const prepareMonth = async (month, year) => {
  const employeesResult = await query(
    `SELECT he.id, he.basic_salary
     FROM hr_employees he
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE he.employment_type = 'full_time' AND he.status != 'terminated'
       AND r.name IS DISTINCT FROM 'super_admin'`
  );

  const created = [];

  for (const emp of employeesResult.rows) {
    const existing = await query(
      `SELECT * FROM hr_payroll_runs WHERE employee_id = $1 AND month = $2 AND year = $3`,
      [emp.id, month, year]
    );
    if (existing.rows.length > 0) { created.push(existing.rows[0]); continue; } // already prepared, return existing

const basicSalary = parseFloat(emp.basic_salary) || 0;

    const components = await getEmployeeComponents(emp.id);
    const totalAllowances = components.filter(c => c.type === 'allowance').reduce((s, c) => s + parseFloat(c.amount), 0);
    const manualDeductions = components.filter(c => c.type === 'deduction').reduce((s, c) => s + parseFloat(c.amount), 0);

    // Working days calculation
    const { workingDays, extraWorkingDays, daysInMonth } = await calculateWorkingDays(emp.id, month, year);
    const dailyRate = basicSalary / daysInMonth;

    // Base salary = daily rate × (working days + extra working days)
    const earnedSalary = dailyRate * (workingDays + extraWorkingDays);

    const { days: unpaidDays, deduction: unpaidDeduction } = await calculateUnpaidLeaveDeduction(emp.id, month, year, dailyRate);
    const previousDue = await getPreviousDue(emp.id, month, year);

    // Daily attendance penalties
    const dailyPenaltyResult = await query(
      `SELECT COALESCE(SUM(penalty_amount), 0) as total FROM hr_attendance
       WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3 AND is_waived = FALSE`,
      [emp.id, month, year]
    );
    const dailyAttendancePenalty = parseFloat(dailyPenaltyResult.rows[0].total) || 0;

    // Pattern-based penalties
    const pattern = await attendanceService.calculatePatternPenalties(emp.id, month, year);
    const patternDeductionDays = pattern.extra_absent_days + pattern.monthly_late_deduction_days;
    const patternDeductionAmount = patternDeductionDays * dailyRate;

    const totalAttendanceDeduction = dailyAttendancePenalty + patternDeductionAmount;
    const totalDeductions = manualDeductions + totalAttendanceDeduction;

    const netPayable = earnedSalary + totalAllowances - totalDeductions - unpaidDeduction + previousDue;

    const result = await query(
      `INSERT INTO hr_payroll_runs
         (employee_id, month, year, basic_salary, total_allowances, total_deductions,
          unpaid_leave_days, unpaid_leave_deduction, previous_due, attendance_deduction,
          working_days, extra_working_days, net_payable, total_paid, due_amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$13,'draft') RETURNING *`,
      [emp.id, month, year, basicSalary, totalAllowances, totalDeductions,
       unpaidDays, unpaidDeduction, previousDue, totalAttendanceDeduction,
       workingDays, extraWorkingDays, netPayable]
    );

    created.push(result.rows[0]);
  }

  return created;
};

// ===== Step 2: Edit draft (manual override) =====

const updateDraftRun = async (id, data) => {
  const existing = await query('SELECT * FROM hr_payroll_runs WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw { statusCode: 404, message: 'Payroll record পাওয়া যায়নি' };
  if (existing.rows[0].status !== 'draft') throw { statusCode: 400, message: 'শুধুমাত্র draft অবস্থায় edit করা যাবে' };

  const { basic_salary, total_allowances, total_deductions, unpaid_leave_deduction, previous_due } = data;

  const basic = basic_salary !== undefined ? parseFloat(basic_salary) : parseFloat(existing.rows[0].basic_salary);
  const allow = total_allowances !== undefined ? parseFloat(total_allowances) : parseFloat(existing.rows[0].total_allowances);
  const ded = total_deductions !== undefined ? parseFloat(total_deductions) : parseFloat(existing.rows[0].total_deductions);
  const unpaidDed = unpaid_leave_deduction !== undefined ? parseFloat(unpaid_leave_deduction) : parseFloat(existing.rows[0].unpaid_leave_deduction);
  const prevDue = previous_due !== undefined ? parseFloat(previous_due) : parseFloat(existing.rows[0].previous_due);

  const netPayable = basic + allow - ded - unpaidDed + prevDue;
  const dueAmount = netPayable - parseFloat(existing.rows[0].total_paid);

  const result = await query(
    `UPDATE hr_payroll_runs SET
       basic_salary = $1, total_allowances = $2, total_deductions = $3,
       unpaid_leave_deduction = $4, previous_due = $5, net_payable = $6, due_amount = $7
     WHERE id = $8 RETURNING *`,
    [basic, allow, ded, unpaidDed, prevDue, netPayable, dueAmount, id]
  );
  return result.rows[0];
};

// ===== Step 3: Finalize =====

const finalizeRun = async (id, finalizedByEmployeeId) => {
  const result = await query(
    `UPDATE hr_payroll_runs SET status = 'finalized', finalized_at = NOW(), finalized_by = $1
     WHERE id = $2 AND status = 'draft' RETURNING *`,
    [finalizedByEmployeeId, id]
  );
  if (result.rows.length === 0) throw { statusCode: 400, message: 'এই payroll finalize করা সম্ভব নয়' };
  return result.rows[0];
};

const finalizeAllDrafts = async (month, year, finalizedByEmployeeId) => {
  const result = await query(
    `UPDATE hr_payroll_runs SET status = 'finalized', finalized_at = NOW(), finalized_by = $1
     WHERE month = $2 AND year = $3 AND status = 'draft' RETURNING *`,
    [finalizedByEmployeeId, month, year]
  );
  return result.rows;
};

// ===== Step 4: Payment (partial or full, allowed any time after draft) =====

const recordPayment = async (payrollRunId, data, paidByEmployeeId, createdByUserId) => {
 const { amount, payment_date, note, proof_url } = data;
  if (!amount || parseFloat(amount) <= 0) throw { statusCode: 400, message: 'সঠিক পরিমাণ দিন' };

  const runResult = await query('SELECT * FROM hr_payroll_runs WHERE id = $1', [payrollRunId]);
  if (runResult.rows.length === 0) throw { statusCode: 404, message: 'Payroll record পাওয়া যায়নি' };
  const run = runResult.rows[0];

  if (run.status === 'draft') throw { statusCode: 400, message: 'প্রথমে Finalize করুন, তারপর payment দিন' };

  const settings = await getSettings();
  if (!settings?.payment_account_id) throw { statusCode: 400, message: 'Payroll Settings-এ Payment account সেট করুন' };

  const empNameResult = await query('SELECT full_name FROM hr_employees WHERE id = $1', [run.employee_id]);
  const empName = empNameResult.rows[0]?.full_name || '';

  // Decide which account to debit: if already closed (liability recorded), debit the payable account; otherwise debit expense account
  const debitAccountId = run.closed_at ? settings.salary_payable_account_id : settings.salary_expense_account_id;
  if (!debitAccountId) throw { statusCode: 400, message: 'Payroll Settings-এ প্রয়োজনীয় account সেট করুন' };

  const txn = await transactionsService.createTransaction({
    transaction_date: payment_date || new Date().toISOString().split('T')[0],
    transaction_type: 'expense',
    description: `Salary Payment - ${empName} (${run.month}/${run.year})${note ? ' - ' + note : ''}`,
    amount,
    debit_account_id: debitAccountId,
    credit_account_id: settings.payment_account_id,
  }, createdByUserId, null);

const paymentResult = await query(
    `INSERT INTO hr_payroll_payments (payroll_run_id, amount, payment_date, note, accounting_transaction_id, paid_by, proof_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [payrollRunId, amount, payment_date || new Date().toISOString().split('T')[0], note || null, txn.id, paidByEmployeeId, proof_url || null]
  );

  const newTotalPaid = parseFloat(run.total_paid) + parseFloat(amount);
  const newDue = parseFloat(run.net_payable) - newTotalPaid;

  await query(
    `UPDATE hr_payroll_runs SET total_paid = $1, due_amount = $2 WHERE id = $3`,
    [newTotalPaid, newDue, payrollRunId]
  );

  return paymentResult.rows[0];
};

const getPayments = async (payrollRunId) => {
  const result = await query(
    `SELECT * FROM hr_payroll_payments WHERE payroll_run_id = $1 ORDER BY payment_date DESC, created_at DESC`,
    [payrollRunId]
  );
  return result.rows;
};

// ===== Step 5: Close month (record remaining due as payable liability) =====

const closeMonth = async (month, year, closedByEmployeeId, createdByUserId) => {
  const settings = await getSettings();
  if (!settings?.salary_payable_account_id || !settings?.salary_expense_account_id) {
    throw { statusCode: 400, message: 'Payroll Settings-এ Salary Expense ও Payable account সেট করুন' };
  }

  const runsResult = await query(
    `SELECT pr.*, he.full_name FROM hr_payroll_runs pr
     JOIN hr_employees he ON he.id = pr.employee_id
     WHERE pr.month = $1 AND pr.year = $2 AND pr.status = 'finalized'`,
    [month, year]
  );

  const closed = [];

  for (const run of runsResult.rows) {
    const due = parseFloat(run.due_amount);

    // Record the full expense for this employee (the amount earned this month, regardless of paid/due)
    // and move the unpaid portion to a payable liability.
    if (due > 0) {
      const txn = await transactionsService.createTransaction({
        transaction_date: new Date().toISOString().split('T')[0],
        transaction_type: 'expense',
        description: `Salary Payable - ${run.full_name} (${run.month}/${run.year})`,
        amount: due,
        debit_account_id: settings.salary_expense_account_id,
        credit_account_id: settings.salary_payable_account_id,
      }, createdByUserId, null);

      await query(
        `UPDATE hr_payroll_runs SET status = 'closed', closed_at = NOW(), closed_by = $1, payable_transaction_id = $2
         WHERE id = $3`,
        [closedByEmployeeId, txn.id, run.id]
      );
    } else {
      await query(
        `UPDATE hr_payroll_runs SET status = 'closed', closed_at = NOW(), closed_by = $1 WHERE id = $2`,
        [closedByEmployeeId, run.id]
      );
    }
    closed.push(run.id);
  }

  return { closed_count: closed.length };
};

// ===== Listing =====

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

module.exports = {
  getEmployeeComponents, addComponent, removeComponent,
  getSettings, updateSettings,
  prepareMonth, updateDraftRun,
  finalizeRun, finalizeAllDrafts,
  recordPayment, getPayments,
  closeMonth,
  getPayrollRuns,
};