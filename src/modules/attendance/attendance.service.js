const { query } = require('../../config/database');

const checkIn = async (employeeId) => {
  const today = new Date().toISOString().split('T')[0];

  const existing = await query(
    'SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2',
    [employeeId, today]
  );
  if (existing.rows.length > 0 && existing.rows[0].check_in_time) {
    throw { statusCode: 400, message: 'আজকে ইতিমধ্যে check-in করা হয়েছে' };
  }

  const empResult = await query(
    'SELECT office_start_time, weekly_off_day FROM hr_employees WHERE id = $1',
    [employeeId]
  );
  const emp = empResult.rows[0];
  if (!emp) throw { statusCode: 404, message: 'কর্মী পাওয়া যায়নি' };

  const now = new Date();
  let isLate = false;
  let lateByMinutes = 0;

  if (emp.office_start_time) {
    const [h, m] = emp.office_start_time.split(':').map(Number);
    const expectedStart = new Date(now);
    expectedStart.setHours(h, m, 0, 0);
    if (now > expectedStart) {
      isLate = true;
      lateByMinutes = Math.round((now - expectedStart) / 60000);
    }
  }

  const result = await query(
    `INSERT INTO hr_attendance (employee_id, date, check_in_time, status, is_late, late_by_minutes)
     VALUES ($1, $2, NOW(), 'present', $3, $4)
     ON CONFLICT (employee_id, date)
     DO UPDATE SET check_in_time = NOW(), status = 'present', is_late = $3, late_by_minutes = $4
     RETURNING *`,
    [employeeId, today, isLate, lateByMinutes]
  );
  return result.rows[0];
};

const checkOut = async (employeeId) => {
  const today = new Date().toISOString().split('T')[0];

  const existing = await query(
    'SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2',
    [employeeId, today]
  );
  if (existing.rows.length === 0 || !existing.rows[0].check_in_time) {
    throw { statusCode: 400, message: 'আগে check-in করুন' };
  }
  if (existing.rows[0].check_out_time) {
    throw { statusCode: 400, message: 'আজকে ইতিমধ্যে check-out করা হয়েছে' };
  }

  const empResult = await query('SELECT office_end_time FROM hr_employees WHERE id = $1', [employeeId]);
  const emp = empResult.rows[0];

  const now = new Date();
  const checkInTime = new Date(existing.rows[0].check_in_time);
  const workingHours = (now - checkInTime) / (1000 * 60 * 60);

  let isEarlyLeave = false;
  let earlyByMinutes = 0;

  if (emp?.office_end_time) {
    const [h, m] = emp.office_end_time.split(':').map(Number);
    const expectedEnd = new Date(now);
    expectedEnd.setHours(h, m, 0, 0);
    if (now < expectedEnd) {
      isEarlyLeave = true;
      earlyByMinutes = Math.round((expectedEnd - now) / 60000);
    }
  }

  const result = await query(
    `UPDATE hr_attendance SET
       check_out_time = NOW(), working_hours = $1, is_early_leave = $2, early_by_minutes = $3
     WHERE employee_id = $4 AND date = $5 RETURNING *`,
    [workingHours.toFixed(2), isEarlyLeave, earlyByMinutes, employeeId, today]
  );
  return result.rows[0];
};

const getTodayStatus = async (employeeId) => {
  const today = new Date().toISOString().split('T')[0];
  const result = await query(
    'SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2',
    [employeeId, today]
  );
  return result.rows[0] || null;
};

const getMyAttendance = async (employeeId, month, year) => {
  const m = month || (new Date().getMonth() + 1);
  const y = year || new Date().getFullYear();

  const result = await query(
    `SELECT * FROM hr_attendance
     WHERE employee_id = $1
       AND EXTRACT(MONTH FROM date) = $2
       AND EXTRACT(YEAR FROM date) = $3
     ORDER BY date DESC`,
    [employeeId, m, y]
  );
  return result.rows;
};

const getAllAttendance = async ({ date, employeeId } = {}) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (date) { conditions.push(`a.date = $${idx++}`); params.push(date); }
  if (employeeId) { conditions.push(`a.employee_id = $${idx++}`); params.push(employeeId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT a.*, he.full_name, he.designation, he.department, he.phone
     FROM hr_attendance a
     JOIN hr_employees he ON he.id = a.employee_id
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     ${where ? where + ' AND' : 'WHERE'} r.name IS DISTINCT FROM 'super_admin'
     ORDER BY a.date DESC, he.full_name ASC`,
    params
  );
  return result.rows;
};

const getMonthlySummary = async (employeeId, month, year) => {
  const m = month || (new Date().getMonth() + 1);
  const y = year || new Date().getFullYear();

  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'present') as present_days,
       COUNT(*) FILTER (WHERE is_late = TRUE) as late_days,
       COUNT(*) FILTER (WHERE is_early_leave = TRUE) as early_leave_days,
       COALESCE(SUM(working_hours), 0) as total_hours
     FROM hr_attendance
     WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
    [employeeId, m, y]
  );
  return result.rows[0];
};

module.exports = {
  checkIn, checkOut, getTodayStatus, getMyAttendance, getAllAttendance, getMonthlySummary,
};