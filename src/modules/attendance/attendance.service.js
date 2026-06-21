const { query } = require('../../config/database');

const getPolicy = async () => {
  const result = await query(`SELECT * FROM hr_attendance_policies WHERE is_active = TRUE LIMIT 1`);
  return result.rows[0];
};

const updatePolicy = async (data) => {
  const {
    grace_minutes, penalty_multiplier, extended_threshold_minutes, extended_penalty_multiplier,
    consecutive_late_days_for_absent, monthly_late_threshold_days, monthly_late_deduction_days,
    waiver_position_id
  } = data;
  const result = await query(
    `UPDATE hr_attendance_policies SET
       grace_minutes = COALESCE($1, grace_minutes),
       penalty_multiplier = COALESCE($2, penalty_multiplier),
       extended_threshold_minutes = COALESCE($3, extended_threshold_minutes),
       extended_penalty_multiplier = COALESCE($4, extended_penalty_multiplier),
       consecutive_late_days_for_absent = COALESCE($5, consecutive_late_days_for_absent),
       monthly_late_threshold_days = COALESCE($6, monthly_late_threshold_days),
       monthly_late_deduction_days = COALESCE($7, monthly_late_deduction_days),
       waiver_position_id = COALESCE($8, waiver_position_id),
       updated_at = NOW()
     WHERE is_active = TRUE RETURNING *`,
    [grace_minutes, penalty_multiplier, extended_threshold_minutes, extended_penalty_multiplier,
     consecutive_late_days_for_absent, monthly_late_threshold_days, monthly_late_deduction_days,
     waiver_position_id || null]
  );
  return result.rows[0];
};

const getBreakTypes = async () => {
  const result = await query(`SELECT * FROM hr_break_types WHERE is_active = TRUE ORDER BY created_at`);
  return result.rows;
};

const updateBreakType = async (id, data) => {
  const { duration_minutes, is_active } = data;
  const result = await query(
    `UPDATE hr_break_types SET
       duration_minutes = COALESCE($1, duration_minutes),
       is_active = COALESCE($2, is_active)
     WHERE id = $3 RETURNING *`,
    [duration_minutes, is_active, id]
  );
  return result.rows[0];
};

const checkIn = async (employeeId) => {
  const today = new Date().toISOString().split('T')[0];
  const existing = await query('SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2', [employeeId, today]);
  if (existing.rows.length > 0 && existing.rows[0].check_in_time) {
    throw { statusCode: 400, message: 'আজকে ইতিমধ্যে check-in করা হয়েছে' };
  }

  const result = await query(
    `INSERT INTO hr_attendance (employee_id, date, check_in_time, status)
     VALUES ($1, $2, NOW(), 'present')
     ON CONFLICT (employee_id, date) DO UPDATE SET check_in_time = NOW(), status = 'present'
     RETURNING *`,
    [employeeId, today]
  );
  return result.rows[0];
};

const breakOut = async (employeeId, breakTypeId) => {
  const today = new Date().toISOString().split('T')[0];
  const attResult = await query('SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2', [employeeId, today]);
  if (attResult.rows.length === 0 || !attResult.rows[0].check_in_time) {
    throw { statusCode: 400, message: 'আগে Check-in করুন' };
  }
  const attendanceId = attResult.rows[0].id;

  const openBreak = await query(
    `SELECT * FROM hr_attendance_breaks WHERE attendance_id = $1 AND break_out_time IS NOT NULL AND break_in_time IS NULL`,
    [attendanceId]
  );
  if (openBreak.rows.length > 0) throw { statusCode: 400, message: 'আগে চলমান break শেষ করুন' };

  const result = await query(
    `INSERT INTO hr_attendance_breaks (attendance_id, break_type_id, break_out_time)
     VALUES ($1, $2, NOW()) RETURNING *`,
    [attendanceId, breakTypeId]
  );
  return result.rows[0];
};

const breakIn = async (employeeId, breakRecordId) => {
  const result = await query(
    `SELECT ab.*, bt.duration_minutes as allowed_minutes
     FROM hr_attendance_breaks ab
     JOIN hr_break_types bt ON bt.id = ab.break_type_id
     WHERE ab.id = $1`,
    [breakRecordId]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Break record পাওয়া যায়নি' };
  const breakRecord = result.rows[0];
  if (breakRecord.break_in_time) throw { statusCode: 400, message: 'এই break ইতিমধ্যে শেষ হয়েছে' };

  const breakOutTime = new Date(breakRecord.break_out_time);
  const now = new Date();
  const actualMinutes = (now - breakOutTime) / 60000;
  const excessMinutes = Math.max(0, actualMinutes - breakRecord.allowed_minutes);

  const updated = await query(
    `UPDATE hr_attendance_breaks SET break_in_time = NOW(), duration_minutes = $1, excess_minutes = $2
     WHERE id = $3 RETURNING *`,
    [actualMinutes.toFixed(1), excessMinutes.toFixed(1), breakRecordId]
  );
  return updated.rows[0];
};

const checkOut = async (employeeId) => {
  const today = new Date().toISOString().split('T')[0];
  const attResult = await query('SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2', [employeeId, today]);
  if (attResult.rows.length === 0 || !attResult.rows[0].check_in_time) {
    throw { statusCode: 400, message: 'আগে check-in করুন' };
  }
  if (attResult.rows[0].check_out_time) {
    throw { statusCode: 400, message: 'আজকে ইতিমধ্যে check-out করা হয়েছে' };
  }
  const attendance = attResult.rows[0];

  const openBreak = await query(
    `SELECT * FROM hr_attendance_breaks WHERE attendance_id = $1 AND break_out_time IS NOT NULL AND break_in_time IS NULL`,
    [attendance.id]
  );
  if (openBreak.rows.length > 0) throw { statusCode: 400, message: 'আগে চলমান break শেষ করুন' };

  const empResult = await query('SELECT office_start_time, office_end_time FROM hr_employees WHERE id = $1', [employeeId]);
  const emp = empResult.rows[0];

  const now = new Date();
  const checkInTime = new Date(attendance.check_in_time);
  const totalMinutesPresent = (now - checkInTime) / 60000;

  const breaksResult = await query(
    `SELECT COALESCE(SUM(excess_minutes), 0) as total_excess FROM hr_attendance_breaks WHERE attendance_id = $1`,
    [attendance.id]
  );
  const breakExcessMinutes = parseFloat(breaksResult.rows[0].total_excess) || 0;

  let lateMinutes = 0;
  let isLate = false;
  if (emp?.office_start_time) {
    const [h, m] = emp.office_start_time.split(':').map(Number);
    const expectedStart = new Date(checkInTime);
    expectedStart.setHours(h, m, 0, 0);
    if (checkInTime > expectedStart) {
      lateMinutes = (checkInTime - expectedStart) / 60000;
      isLate = lateMinutes > 0;
    }
  }

  let earlyMinutes = 0;
  let isEarlyLeave = false;
  if (emp?.office_end_time) {
    const [h, m] = emp.office_end_time.split(':').map(Number);
    const expectedEnd = new Date(now);
    expectedEnd.setHours(h, m, 0, 0);
    if (now < expectedEnd) {
      earlyMinutes = (expectedEnd - now) / 60000;
      isEarlyLeave = earlyMinutes > 0;
    }
  }

  const totalDeficitMinutes = lateMinutes + earlyMinutes + breakExcessMinutes;

  const policy = await getPolicy();
  const penaltyAmount = await calculateDailyPenalty(employeeId, totalDeficitMinutes, policy);

  const workingHours = (totalMinutesPresent - breakExcessMinutes) / 60;

  const result = await query(
    `UPDATE hr_attendance SET
       check_out_time = NOW(), working_hours = $1, is_late = $2, late_by_minutes = $3,
       is_early_leave = $4, early_by_minutes = $5, total_deficit_minutes = $6, penalty_amount = $7
     WHERE employee_id = $8 AND date = $9 RETURNING *`,
    [workingHours.toFixed(2), isLate, Math.round(lateMinutes), isEarlyLeave, Math.round(earlyMinutes),
     totalDeficitMinutes.toFixed(1), penaltyAmount, employeeId, today]
  );
  return result.rows[0];
};

const calculateDailyPenalty = async (employeeId, deficitMinutes, policy) => {
  if (deficitMinutes <= policy.grace_minutes) return 0;

  const empResult = await query('SELECT basic_salary FROM hr_employees WHERE id = $1', [employeeId]);
  const basicSalary = parseFloat(empResult.rows[0]?.basic_salary) || 0;
  const perMinuteRate = basicSalary / 30 / (8 * 60);

  const penalizedMinutes = deficitMinutes - policy.grace_minutes;
  const extendedThreshold = policy.extended_threshold_minutes;

  let penalty = 0;
  if (penalizedMinutes <= extendedThreshold) {
    penalty = penalizedMinutes * perMinuteRate * policy.penalty_multiplier;
  } else {
    penalty = extendedThreshold * perMinuteRate * policy.penalty_multiplier;
    penalty += (penalizedMinutes - extendedThreshold) * perMinuteRate * policy.extended_penalty_multiplier;
  }
  return penalty.toFixed(2);
};

const getTodayStatus = async (employeeId) => {
  const today = new Date().toISOString().split('T')[0];
  const attResult = await query('SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2', [employeeId, today]);
  if (attResult.rows.length === 0) return null;

  const breaksResult = await query(
    `SELECT ab.*, bt.name_bn as break_name, bt.duration_minutes as allowed_minutes
     FROM hr_attendance_breaks ab JOIN hr_break_types bt ON bt.id = ab.break_type_id
     WHERE ab.attendance_id = $1 ORDER BY ab.break_out_time ASC`,
    [attResult.rows[0].id]
  );

  return { ...attResult.rows[0], breaks: breaksResult.rows };
};

const getMyAttendance = async (employeeId, month, year) => {
  const m = month || (new Date().getMonth() + 1);
  const y = year || new Date().getFullYear();
  const result = await query(
    `SELECT * FROM hr_attendance
     WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
     ORDER BY date DESC`,
    [employeeId, m, y]
  );
  return result.rows;
};

const getAllAttendance = async ({ date, dateFrom, dateTo, employeeId, status } = {}) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (date) { conditions.push(`a.date = $${idx++}`); params.push(date); }
  if (dateFrom) { conditions.push(`a.date >= $${idx++}`); params.push(dateFrom); }
  if (dateTo) { conditions.push(`a.date <= $${idx++}`); params.push(dateTo); }
  if (employeeId) { conditions.push(`a.employee_id = $${idx++}`); params.push(employeeId); }
  if (status === 'late') { conditions.push(`a.is_late = TRUE`); }
  if (status === 'on_time') { conditions.push(`a.is_late = FALSE`); }
  if (status === 'absent') { conditions.push(`a.check_in_time IS NULL`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT a.*, he.full_name, he.designation, he.department, he.phone
     FROM hr_attendance a
     JOIN hr_employees he ON he.id = a.employee_id
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     ${where ? where + ' AND' : 'WHERE'} r.name IS DISTINCT FROM 'super_admin'
     ORDER BY a.date DESC, a.check_in_time ASC NULLS LAST`,
    params
  );

  const records = result.rows;
  if (records.length === 0) return records;

  const attendanceIds = records.map(r => r.id);
  const breaksResult = await query(
    `SELECT ab.*, bt.name_bn as break_name
     FROM hr_attendance_breaks ab
     JOIN hr_break_types bt ON bt.id = ab.break_type_id
     WHERE ab.attendance_id = ANY($1)
     ORDER BY ab.break_out_time ASC`,
    [attendanceIds]
  );

  const breaksByAttendance = {};
  breaksResult.rows.forEach(b => {
    if (!breaksByAttendance[b.attendance_id]) breaksByAttendance[b.attendance_id] = [];
    breaksByAttendance[b.attendance_id].push(b);
  });

  return records.map(r => ({ ...r, breaks: breaksByAttendance[r.id] || [] }));
};
const getMonthlySummary = async (employeeId, month, year) => {
  const m = month || (new Date().getMonth() + 1);
  const y = year || new Date().getFullYear();
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'present') as present_days,
       COUNT(*) FILTER (WHERE is_late = TRUE) as late_days,
       COUNT(*) FILTER (WHERE is_early_leave = TRUE) as early_leave_days,
       COALESCE(SUM(working_hours), 0) as total_hours,
       COALESCE(SUM(penalty_amount), 0) as total_penalty
     FROM hr_attendance
     WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3 AND is_waived = FALSE`,
    [employeeId, m, y]
  );
  return result.rows[0];
};

const calculatePatternPenalties = async (employeeId, month, year) => {
  const policy = await getPolicy();

  const recordsResult = await query(
    `SELECT date, is_late, late_by_minutes, is_waived FROM hr_attendance
     WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
     ORDER BY date ASC`,
    [employeeId, month, year]
  );
  const records = recordsResult.rows.filter(r => !r.is_waived);

  const significantLateDays = records.filter(r => r.is_late && r.late_by_minutes > policy.grace_minutes);

  let consecutiveCount = 0;
  let maxConsecutive = 0;
  let prevDate = null;
  for (const r of records) {
    const isSignificantLate = r.is_late && r.late_by_minutes > policy.grace_minutes;
    const currentDate = new Date(r.date);
    const isConsecutiveDay = prevDate && (currentDate - prevDate) / 86400000 === 1;

    if (isSignificantLate && (isConsecutiveDay || consecutiveCount === 0)) {
      consecutiveCount = isConsecutiveDay ? consecutiveCount + 1 : 1;
    } else if (!isSignificantLate) {
      consecutiveCount = 0;
    }
    maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
    prevDate = currentDate;
  }

  const extraAbsentDays = Math.floor(maxConsecutive / policy.consecutive_late_days_for_absent);

  const lateCount = significantLateDays.length;
  const overThreshold = Math.max(0, lateCount - policy.monthly_late_threshold_days);
  const monthlyLateDeductionDays = overThreshold * parseFloat(policy.monthly_late_deduction_days);

  return {
    significant_late_count: lateCount,
    extra_absent_days: extraAbsentDays,
    monthly_late_deduction_days: monthlyLateDeductionDays,
  };
};

const requestWaiver = async (employeeId, data) => {
  const { attendance_id, month, year, waiver_type, reason } = data;
  const result = await query(
    `INSERT INTO hr_attendance_waivers (employee_id, attendance_id, month, year, waiver_type, reason, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [employeeId, attendance_id || null, month || null, year || null, waiver_type, reason, employeeId]
  );
  return result.rows[0];
};

const getWaivers = async (status) => {
  const conditions = status ? `WHERE w.status = $1` : '';
  const params = status ? [status] : [];
  const result = await query(
    `SELECT w.*, he.full_name as employee_name
     FROM hr_attendance_waivers w
     JOIN hr_employees he ON he.id = w.employee_id
     ${conditions}
     ORDER BY w.created_at DESC`,
    params
  );
  return result.rows;
};

const decideWaiver = async (id, decision, decidedByEmployeeId) => {
  const result = await query(
    `UPDATE hr_attendance_waivers SET status = $1, decided_by = $2, decided_at = NOW() WHERE id = $3 RETURNING *`,
    [decision, decidedByEmployeeId, id]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Waiver পাওয়া যায়নি' };

  if (decision === 'approved' && result.rows[0].attendance_id) {
    await query(`UPDATE hr_attendance SET is_waived = TRUE WHERE id = $1`, [result.rows[0].attendance_id]);
  }
  return result.rows[0];
};

module.exports = {
  getPolicy,
  updatePolicy,
  getBreakTypes,
  updateBreakType,
  checkIn,
  breakOut,
  breakIn,
  checkOut,
  getTodayStatus,
  getMyAttendance,
  getAllAttendance,
  getMonthlySummary,
  calculatePatternPenalties,
  requestWaiver,
  getWaivers,
  decideWaiver,
};