const { query } = require('../../config/database');
const transactionsService = require('../accounting/transactions.service');
const attendanceService = require('../attendance/attendance.service');

// ===== Salary Components =====

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

// ===== Working Days Calculation =====

const calculateWorkingDays = async (employeeId, month, year) => {
  const empResult = await query('SELECT weekly_off_day FROM hr_employees WHERE id = $1', [employeeId]);
  const weeklyOffDay = empResult.rows[0]?.weekly_off_day;
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const daysInMonth = new Date(year, month, 0).getDate();

  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    return { dateStr: d.toISOString().split('T')[0], dayName: dayNames[d.getDay()] };
  });

  // Actual attendance দিন
  const attendanceResult = await query(
    `SELECT date FROM hr_attendance
     WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
     AND check_in_time IS NOT NULL`,
    [employeeId, month, year]
  );
  const attendanceDates = new Set(attendanceResult.rows.map(r => r.date.toISOString().split('T')[0]));

  // Approved Paid Leave দিন
  const paidLeaveResult = await query(
    `SELECT COALESCE(la.modified_start_date, la.start_date) as eff_start,
            COALESCE(la.modified_end_date, la.end_date) as eff_end
     FROM hr_leave_applications la
     JOIN hr_leave_types lt ON lt.id = la.leave_type_id
     WHERE la.employee_id = $1 AND la.status = 'approved' AND lt.is_paid = TRUE
       AND (EXTRACT(MONTH FROM la.start_date) = $2 OR EXTRACT(MONTH FROM la.end_date) = $2)
       AND (EXTRACT(YEAR FROM la.start_date) = $3 OR EXTRACT(YEAR FROM la.end_date) = $3)`,
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

  // Office Holiday দিন
  const holidayResult = await query(
    `SELECT date FROM hr_office_holidays
     WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2`,
    [month, year]
  );
  const holidayDates = new Set(holidayResult.rows.map(r => r.date.toISOString().split('T')[0]));

  let attendanceDays = 0;
  let weeklyOffDays = 0;
  let holidayDays = 0;
  let paidLeaveDays = 0;
  let extraWorkingDays = 0;

  for (const { dateStr, dayName } of allDays) {
    const isWeeklyOff = weeklyOffDay && dayName === weeklyOffDay;
    const isPresent = attendanceDates.has(dateStr);
    const isPaidLeave = paidLeaveDates.has(dateStr);
    const isHoliday = holidayDates.has(dateStr);

    if (isWeeklyOff) {
      if (isPresent) {
        extraWorkingDays++;
      } else {
        weeklyOffDays++;
      }
      continue;
    }

    if (isPresent) {
      attendanceDays++;
    } else if (isPaidLeave) {
      paidLeaveDays++;
    } else if (isHoliday) {
      holidayDays++;
    }
  }

  const workingDays = attendanceDays + weeklyOffDays + holidayDays + paidLeaveDays + extraWorkingDays;

  return { workingDays, attendanceDays, weeklyOffDays, holidayDays, paidLeaveDays, extraWorkingDays, daysInMonth };
};

// ===== Previous Due =====

const getPreviousDue = async (employeeId, month, year) => {
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }
  const result = await query(
    `SELECT due_amount FROM hr_payroll_runs WHERE employee_id = $1 AND month = $2 AND year = $3`,
    [employeeId, prevMonth, prevYear]
  );
  return result.rows.length > 0 ? parseFloat(result.rows[0].due_amount) || 0 : 0;
};

// ===== Step 1: Prepare (draft) =====

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
    if (existing.rows.length > 0) { created.push(existing.rows[0]); continue; }

    const basicSalary = parseFloat(emp.basic_salary) || 0;
    const components = await getEmployeeComponents(emp.id);
    const totalAllowances = components.filter(c => c.type === 'allowance').reduce((s, c) => s + parseFloat(c.amount), 0);
    const manualDeductions = components.filter(c => c.type === 'deduction').reduce((s, c) => s + parseFloat(c.amount), 0);

    const { workingDays, attendanceDays, weeklyOffDays, holidayDays, paidLeaveDays, extraWorkingDays, daysInMonth } = await calculateWorkingDays(emp.id, month, year);
    const dailyRate = basicSalary / daysInMonth;
    const earnedSalary = dailyRate * workingDays;

    const previousDue = await getPreviousDue(emp.id, month, year);

    // Attendance penalties
   // Calculate penalty from late_by_minutes directly (in case check-out was missed)
  const attendanceRecords = await query(
    `SELECT late_by_minutes, is_waived, penalty_amount FROM hr_attendance
     WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
    [emp.id, month, year]
  );
  const policy = await attendanceService.getPolicy();
  let dailyAttendancePenalty = 0;
  for (const rec of attendanceRecords.rows) {
    if (rec.is_waived) continue;
    if (parseFloat(rec.penalty_amount) > 0) {
      dailyAttendancePenalty += parseFloat(rec.penalty_amount);
    } else if (rec.late_by_minutes > policy.grace_minutes) {
      const penalizedMinutes = rec.late_by_minutes - policy.grace_minutes;
      const perMinuteRate = basicSalary / 30 / (8 * 60);
      const extended = policy.extended_threshold_minutes;
      let p = 0;
      if (penalizedMinutes <= extended) {
        p = penalizedMinutes * perMinuteRate * policy.penalty_multiplier;
      } else {
        p = extended * perMinuteRate * policy.penalty_multiplier;
        p += (penalizedMinutes - extended) * perMinuteRate * policy.extended_penalty_multiplier;
      }
      dailyAttendancePenalty += p;
    }
  }

    const pattern = await attendanceService.calculatePatternPenalties(emp.id, month, year);
    const patternDeductionDays = pattern.extra_absent_days + pattern.monthly_late_deduction_days;
    const patternDeductionAmount = patternDeductionDays * dailyRate;

    const totalAttendanceDeduction = dailyAttendancePenalty + patternDeductionAmount;
    const totalDeductions = manualDeductions; // শুধু manual deductions, attendance penalty আলাদা
    const netPayable = earnedSalary + totalAllowances - totalDeductions - totalAttendanceDeduction + previousDue;

    const result = await query(
      `INSERT INTO hr_payroll_runs
         (employee_id, month, year, basic_salary, total_allowances, total_deductions,
          unpaid_leave_days, unpaid_leave_deduction, previous_due, attendance_deduction,
          working_days, extra_working_days, attendance_days, weekly_off_days, holiday_days, paid_leave_days,
          net_payable, total_paid, due_amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,0,0,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$15,'draft') RETURNING *`,
      [emp.id, month, year, basicSalary, totalAllowances, totalDeductions,
       previousDue, totalAttendanceDeduction,
       workingDays, extraWorkingDays, attendanceDays, weeklyOffDays, holidayDays, paidLeaveDays,
       netPayable]
    );
    created.push(result.rows[0]);
  }

  return created;
};

// ===== Step 2: Edit draft =====

const updateDraftRun = async (id, data) => {
  const existing = await query('SELECT * FROM hr_payroll_runs WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw { statusCode: 404, message: 'Payroll record পাওয়া যায়নি' };
  if (existing.rows[0].status !== 'draft') throw { statusCode: 400, message: 'শুধুমাত্র draft অবস্থায় edit করা যাবে' };

  const run = existing.rows[0];
  const { basic_salary, total_allowances, total_deductions, previous_due } = data;

  const basic = basic_salary !== undefined ? parseFloat(basic_salary) : parseFloat(run.basic_salary);
  const allow = total_allowances !== undefined ? parseFloat(total_allowances) : parseFloat(run.total_allowances);
  const ded = total_deductions !== undefined ? parseFloat(total_deductions) : parseFloat(run.total_deductions);
  const prevDue = previous_due !== undefined ? parseFloat(previous_due) : parseFloat(run.previous_due);

  const workingDays = parseFloat(run.working_days) || 0;
  const daysInMonth = new Date(run.year, run.month, 0).getDate();
  const dailyRate = basic / daysInMonth;
  const earnedSalary = dailyRate * workingDays;

  const netPayable = earnedSalary + allow - ded + prevDue;
  const dueAmount = netPayable - parseFloat(run.total_paid);

  const result = await query(
    `UPDATE hr_payroll_runs SET
       basic_salary = $1, total_allowances = $2, total_deductions = $3,
       previous_due = $4, net_payable = $5, due_amount = $6
     WHERE id = $7 RETURNING *`,
    [basic, allow, ded, prevDue, netPayable, dueAmount, id]
  );
  return result.rows[0];
};

// ===== Step 2b: Recalculate =====

const recalculateRun = async (id) => {
  const existing = await query('SELECT * FROM hr_payroll_runs WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw { statusCode: 404, message: 'Payroll record পাওয়া যায়নি' };
  if (existing.rows[0].status !== 'draft') throw { statusCode: 400, message: 'শুধুমাত্র draft অবস্থায় recalculate করা যাবে' };

  const run = existing.rows[0];
  const empResult = await query('SELECT basic_salary FROM hr_employees WHERE id = $1', [run.employee_id]);
  const basicSalary = parseFloat(empResult.rows[0]?.basic_salary) || 0;

  const components = await getEmployeeComponents(run.employee_id);
  const totalAllowances = components.filter(c => c.type === 'allowance').reduce((s, c) => s + parseFloat(c.amount), 0);
  const manualDeductions = components.filter(c => c.type === 'deduction').reduce((s, c) => s + parseFloat(c.amount), 0);

  const { workingDays, attendanceDays, weeklyOffDays, holidayDays, paidLeaveDays, extraWorkingDays, daysInMonth } = await calculateWorkingDays(run.employee_id, run.month, run.year);
  const dailyRate = basicSalary / daysInMonth;
  const earnedSalary = dailyRate * workingDays;

  const previousDue = await getPreviousDue(run.employee_id, run.month, run.year);

  const attendanceRecords = await query(
    `SELECT late_by_minutes, is_waived, penalty_amount FROM hr_attendance
     WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
    [run.employee_id, run.month, run.year]
  );
  const policy = await attendanceService.getPolicy();
  let dailyAttendancePenalty = 0;
  for (const rec of attendanceRecords.rows) {
    if (rec.is_waived) continue;
    if (parseFloat(rec.penalty_amount) > 0) {
      dailyAttendancePenalty += parseFloat(rec.penalty_amount);
    } else if (rec.late_by_minutes > policy.grace_minutes) {
      const penalizedMinutes = rec.late_by_minutes - policy.grace_minutes;
      const perMinuteRate = basicSalary / 30 / (8 * 60);
      const extended = policy.extended_threshold_minutes;
      let p = 0;
      if (penalizedMinutes <= extended) {
        p = penalizedMinutes * perMinuteRate * policy.penalty_multiplier;
      } else {
        p = extended * perMinuteRate * policy.penalty_multiplier;
        p += (penalizedMinutes - extended) * perMinuteRate * policy.extended_penalty_multiplier;
      }
      dailyAttendancePenalty += p;
    }
  }

  const pattern = await attendanceService.calculatePatternPenalties(run.employee_id, run.month, run.year);
  const patternDeductionDays = pattern.extra_absent_days + pattern.monthly_late_deduction_days;
  const patternDeductionAmount = patternDeductionDays * dailyRate;

  const totalAttendanceDeduction = dailyAttendancePenalty + patternDeductionAmount;
  const totalDeductions = manualDeductions; // শুধু manual deductions, attendance penalty আলাদা
  const netPayable = earnedSalary + totalAllowances - totalDeductions - totalAttendanceDeduction + previousDue;
  const dueAmount = netPayable - parseFloat(run.total_paid);

  const result = await query(
    `UPDATE hr_payroll_runs SET
       basic_salary = $1, total_allowances = $2, total_deductions = $3,
       unpaid_leave_days = 0, unpaid_leave_deduction = 0, previous_due = $4,
       attendance_deduction = $5, working_days = $6, extra_working_days = $7,
       attendance_days = $8, weekly_off_days = $9, holiday_days = $10, paid_leave_days = $11,
       net_payable = $12, due_amount = $13
     WHERE id = $14 RETURNING *`,
    [basicSalary, totalAllowances, totalDeductions, previousDue,
     totalAttendanceDeduction, workingDays, extraWorkingDays,
     attendanceDays, weeklyOffDays, holidayDays, paidLeaveDays,
     netPayable, dueAmount, id]
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

// ===== Step 4: Payment =====

const recordPayment = async (payrollRunId, data, paidByEmployeeId, createdByUserId) => {
  const { amount, payment_date, note, proof_url } = data;
  if (!amount || parseFloat(amount) <= 0) throw { statusCode: 400, message: 'সঠিক পরিমাণ দিন' };

  const runResult = await query('SELECT * FROM hr_payroll_runs WHERE id = $1', [payrollRunId]);
  if (runResult.rows.length === 0) throw { statusCode: 404, message: 'Payroll record পাওয়া যায়নি' };
  const run = runResult.rows[0];


  const settings = await getSettings();
  if (!settings?.payment_account_id) throw { statusCode: 400, message: 'Payroll Settings-এ Payment account সেট করুন' };

  const empNameResult = await query('SELECT full_name FROM hr_employees WHERE id = $1', [run.employee_id]);
  const empName = empNameResult.rows[0]?.full_name || '';

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

const updatePayment = async (paymentId, data, createdByUserId) => {
  const paymentResult = await query('SELECT * FROM hr_payroll_payments WHERE id = $1', [paymentId]);
  if (paymentResult.rows.length === 0) throw { statusCode: 404, message: 'Payment পাওয়া যায়নি' };
  const payment = paymentResult.rows[0];

  const runResult = await query('SELECT * FROM hr_payroll_runs WHERE id = $1', [payment.payroll_run_id]);
  const run = runResult.rows[0];
  const empNameResult = await query('SELECT full_name FROM hr_employees WHERE id = $1', [run.employee_id]);
  const empName = empNameResult.rows[0]?.full_name || '';

  const { amount, payment_date, note } = data;
  const newAmount = amount !== undefined ? parseFloat(amount) : parseFloat(payment.amount);
  const newDate = payment_date || payment.payment_date;
  const newNote = note !== undefined ? note : payment.note;

  // Update accounting transaction
  if (payment.accounting_transaction_id) {
    // Get existing transaction to preserve debit/credit accounts
   const existingTxn = await query(
      'SELECT debit_account_id, credit_account_id, transaction_type FROM acc_transactions WHERE id = $1',
      [payment.accounting_transaction_id]
    );
    const txn = existingTxn.rows[0];

    await transactionsService.updateTransaction(payment.accounting_transaction_id, {
      amount: newAmount,
      transaction_date: newDate,
      description: `Salary Payment - ${empName} (${run.month}/${run.year})${newNote ? ' - ' + newNote : ''}`,
      debit_account_id: txn?.debit_account_id,
      credit_account_id: txn?.credit_account_id,
      transaction_type: txn?.transaction_type,
    }, null);
  }

  // Update payment record
  await query(
    `UPDATE hr_payroll_payments SET amount = $1, payment_date = $2, note = $3 WHERE id = $4`,
    [newAmount, newDate, newNote || null, paymentId]
  );

  // Recalculate total_paid and due_amount
  const remainingResult = await query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM hr_payroll_payments WHERE payroll_run_id = $1`,
    [payment.payroll_run_id]
  );
  const newTotalPaid = parseFloat(remainingResult.rows[0].total) || 0;
  const newDue = parseFloat(run.net_payable) - newTotalPaid;

  await query(
    `UPDATE hr_payroll_runs SET total_paid = $1, due_amount = $2 WHERE id = $3`,
    [newTotalPaid, newDue, payment.payroll_run_id]
  );

  return { success: true, new_total_paid: newTotalPaid, new_due: newDue };
};

const deletePayment = async (paymentId, createdByUserId) => {
  const paymentResult = await query('SELECT * FROM hr_payroll_payments WHERE id = $1', [paymentId]);
  if (paymentResult.rows.length === 0) throw { statusCode: 404, message: 'Payment পাওয়া যায়নি' };
  const payment = paymentResult.rows[0];

  // Delete linked accounting transaction
  if (payment.accounting_transaction_id) {
    await transactionsService.deleteTransaction(payment.accounting_transaction_id);
  }

  // Delete payment record
  await query('DELETE FROM hr_payroll_payments WHERE id = $1', [paymentId]);

  // Recalculate total_paid and due_amount
  const remainingResult = await query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM hr_payroll_payments WHERE payroll_run_id = $1`,
    [payment.payroll_run_id]
  );
  const newTotalPaid = parseFloat(remainingResult.rows[0].total) || 0;

  const runResult = await query('SELECT net_payable FROM hr_payroll_runs WHERE id = $1', [payment.payroll_run_id]);
  const netPayable = parseFloat(runResult.rows[0]?.net_payable) || 0;
  const newDue = netPayable - newTotalPaid;

  await query(
    `UPDATE hr_payroll_runs SET total_paid = $1, due_amount = $2 WHERE id = $3`,
    [newTotalPaid, newDue, payment.payroll_run_id]
  );

  return { success: true };
};

// ===== Step 5: Close month =====

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
        `UPDATE hr_payroll_runs SET status = 'closed', closed_at = NOW(), closed_by = $1, payable_transaction_id = $2 WHERE id = $3`,
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
  prepareMonth, updateDraftRun, recalculateRun,
  finalizeRun, finalizeAllDrafts,
  recordPayment, getPayments, updatePayment, deletePayment,
  closeMonth,
  getPayrollRuns,
};