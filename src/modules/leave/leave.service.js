const { query } = require('../../config/database');

// ===== Leave Types =====
const getLeaveTypes = async () => {
  const result = await query('SELECT * FROM hr_leave_types ORDER BY created_at ASC');
  return result.rows;
};

const createLeaveType = async (data) => {
  const { name, name_bn, code, annual_quota_days, is_paid, applicable_to, eligibility_months } = data;
  const result = await query(
    `INSERT INTO hr_leave_types (name, name_bn, code, annual_quota_days, is_paid, applicable_to, eligibility_months)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, name_bn, code, annual_quota_days || 0, is_paid !== false, applicable_to || 'full_time', eligibility_months || 0]
  );
  return result.rows[0];
};

const updateLeaveType = async (id, data) => {
  const { name, name_bn, annual_quota_days, is_paid, applicable_to, is_active, eligibility_months } = data;
  const result = await query(
    `UPDATE hr_leave_types SET
       name = COALESCE($1, name),
       name_bn = COALESCE($2, name_bn),
       annual_quota_days = COALESCE($3, annual_quota_days),
       is_paid = COALESCE($4, is_paid),
       applicable_to = COALESCE($5, applicable_to),
       is_active = COALESCE($6, is_active),
       eligibility_months = COALESCE($7, eligibility_months)
     WHERE id = $8 RETURNING *`,
    [name, name_bn, annual_quota_days, is_paid, applicable_to, is_active, eligibility_months, id]
  );
  return result.rows[0];
};

// ===== Leave Policy =====
const getLeavePolicy = async () => {
  const result = await query(
    `SELECT lp.*,
            cp.title as check_position_title,
            cnp.title as consent_position_title,
            ap.title as approval_position_title
     FROM hr_leave_policies lp
     LEFT JOIN hr_positions cp ON cp.id = lp.check_position_id
     LEFT JOIN hr_positions cnp ON cnp.id = lp.consent_position_id
     LEFT JOIN hr_positions ap ON ap.id = lp.approval_position_id
     WHERE lp.is_active = TRUE LIMIT 1`
  );
  return result.rows[0];
};

const updateLeavePolicy = async (data) => {
  const { half_day_max_hours, short_leave_chain, full_leave_chain,
          check_position_id, consent_position_id, approval_position_id } = data;
  const result = await query(
    `UPDATE hr_leave_policies SET
       half_day_max_hours = COALESCE($1, half_day_max_hours),
       short_leave_chain = COALESCE($2, short_leave_chain),
       full_leave_chain = COALESCE($3, full_leave_chain),
       check_position_id = COALESCE($4, check_position_id),
       consent_position_id = COALESCE($5, consent_position_id),
       approval_position_id = COALESCE($6, approval_position_id),
       updated_at = NOW()
     WHERE is_active = TRUE RETURNING *`,
    [half_day_max_hours, short_leave_chain ? JSON.stringify(short_leave_chain) : null,
     full_leave_chain ? JSON.stringify(full_leave_chain) : null,
     check_position_id || null, consent_position_id || null, approval_position_id || null]
  );
  return result.rows[0];
};

// ===== Leave Balance =====
const isEligible = (joiningDate, eligibilityMonths) => {
  if (!eligibilityMonths) return true; // 0-month requirement = no joining-date dependency, always eligible
  if (!joiningDate) return false; // requirement exists but no joining date on file — cannot verify, so don't grant it silently
  const months = (new Date() - new Date(joiningDate)) / (1000 * 60 * 60 * 24 * 30.44);
  return months >= eligibilityMonths;
};

const getEmployeeBalances = async (employeeId, year) => {
  const currentYear = year || new Date().getFullYear();
  const empResult = await query('SELECT employment_type, joining_date FROM hr_employees WHERE id = $1', [employeeId]);
  const emp = empResult.rows[0];

  if (emp?.employment_type === 'full_time') {
    const types = await query(`SELECT * FROM hr_leave_types WHERE is_active = TRUE AND applicable_to = 'full_time'`);
    for (const t of types.rows) {
      if (!isEligible(emp.joining_date, t.eligibility_months)) continue; // not yet eligible, skip creating balance
      await query(
        `INSERT INTO hr_leave_balances (employee_id, leave_type_id, year, total_days, used_days)
         VALUES ($1, $2, $3, $4, 0)
         ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING`,
        [employeeId, t.id, currentYear, t.annual_quota_days]
      );
    }
  }

  // Also ensure 'all' applicable types exist (eligibility applies here too)
  const allTypes = await query(`SELECT * FROM hr_leave_types WHERE is_active = TRUE AND applicable_to = 'all'`);
  for (const t of allTypes.rows) {
    if (!isEligible(emp?.joining_date, t.eligibility_months)) continue;
    await query(
      `INSERT INTO hr_leave_balances (employee_id, leave_type_id, year, total_days, used_days)
       VALUES ($1, $2, $3, 0, 0)
       ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING`,
      [employeeId, t.id, currentYear]
    );
  }

  const result = await query(
    `SELECT lb.*, lt.name, lt.name_bn, lt.code, lt.is_paid, lt.applicable_to,
            (lb.total_days - lb.used_days) as remaining_days
     FROM hr_leave_balances lb
     JOIN hr_leave_types lt ON lt.id = lb.leave_type_id
     WHERE lb.employee_id = $1 AND lb.year = $2
     ORDER BY lt.created_at ASC`,
    [employeeId, currentYear]
  );
  return result.rows;
};

// ===== Leave Applications =====

// Calculate working days between two dates excluding weekly_off_day
const calculateWorkingDays = async (employeeId, startDate, endDate) => {
  const empResult = await query('SELECT weekly_off_day FROM hr_employees WHERE id = $1', [employeeId]);
  const weeklyOffDay = empResult.rows[0]?.weekly_off_day;

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayName = dayNames[current.getDay()];
    if (dayName !== weeklyOffDay) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

const applyLeave = async (employeeId, data) => {
  const { leave_type_id, start_date, end_date, is_half_day, reason } = data;

  // Calculate duration
  let duration_days;
  if (is_half_day) {
    duration_days = 0.5;
  } else {
    duration_days = await calculateWorkingDays(employeeId, start_date, end_date);
  }

  // Get active policy
  const policy = await getLeavePolicy();
  if (!policy) throw { statusCode: 400, message: 'কোনো সক্রিয় leave policy নেই' };

  // Determine chain based on duration
  const chain = duration_days < 1 ? policy.short_leave_chain : policy.full_leave_chain;
  const firstStatus = `pending_${chain[0]}`;

  // Check balance for paid leave (full-time only)
  const empResult = await query('SELECT employment_type FROM hr_employees WHERE id = $1', [employeeId]);
  const emp = empResult.rows[0];
  const leaveType = await query('SELECT * FROM hr_leave_types WHERE id = $1', [leave_type_id]);
  const lt = leaveType.rows[0];

  if (lt?.is_paid && emp?.employment_type === 'full_time') {
    const year = new Date(start_date).getFullYear();
    const balance = await query(
      `SELECT total_days - used_days as remaining FROM hr_leave_balances
       WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3`,
      [employeeId, leave_type_id, year]
    );
    if (balance.rows.length === 0 || balance.rows[0].remaining < duration_days) {
      throw { statusCode: 400, message: `পর্যাপ্ত ${lt.name_bn} নেই` };
    }
  }

  const result = await query(
    `INSERT INTO hr_leave_applications
       (employee_id, leave_type_id, start_date, end_date, duration_days, is_half_day, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [employeeId, leave_type_id, start_date, end_date, duration_days, is_half_day || false, reason, firstStatus]
  );
  return result.rows[0];
};

const getApplications = async ({ employeeId, status, year } = {}) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (employeeId) { conditions.push(`la.employee_id = $${idx++}`); params.push(employeeId); }
  if (status) { conditions.push(`la.status = $${idx++}`); params.push(status); }
  if (year) { conditions.push(`EXTRACT(YEAR FROM la.start_date) = $${idx++}`); params.push(year); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT la.*,
            he.full_name as employee_name,
            lt.name as leave_type_name, lt.name_bn as leave_type_name_bn, lt.code as leave_type_code,
            lt.is_paid
     FROM hr_leave_applications la
     JOIN hr_employees he ON he.id = la.employee_id
     JOIN hr_leave_types lt ON lt.id = la.leave_type_id
     ${where}
     ORDER BY la.created_at DESC`,
    params
  );

  // Attach "currently with" info for pending applications (who/which position is responsible right now)
  const policy = await getLeavePolicy();
  const applications = result.rows;

  for (const app of applications) {
    if (!app.status.startsWith('pending_') || !policy) continue;
    const stage = app.status.replace('pending_', '');
    const positionId = stage === 'check' ? policy.check_position_id
      : stage === 'consent' ? policy.consent_position_id
      : policy.approval_position_id;

    if (positionId) {
      const holders = await query(
        `SELECT he.full_name FROM hr_employees he
         LEFT JOIN users u ON u.id = he.user_id
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE he.position_id = $1 AND r.name IS DISTINCT FROM 'super_admin'`,
        [positionId]
      );
      app.pending_with = holders.rows.map(h => h.full_name).join(', ') || null;
    }
  }

  return applications;
};
const processApplication = async (applicationId, action, actorEmployeeId, data = {}) => {
  const appResult = await query(
    'SELECT * FROM hr_leave_applications WHERE id = $1',
    [applicationId]
  );
  if (appResult.rows.length === 0) throw { statusCode: 404, message: 'আবেদন পাওয়া যায়নি' };
  const app = appResult.rows[0];

  const policy = await getLeavePolicy();
  const chain = app.duration_days < 1 ? policy.short_leave_chain : policy.full_leave_chain;

  const currentStage = app.status.replace('pending_', '');
  const currentIdx = chain.indexOf(currentStage);
  if (currentIdx === -1) throw { statusCode: 400, message: 'এই আবেদন process করা সম্ভব নয়' };

  let newStatus;
  let updateFields = {};

  if (currentStage === 'check') {
    // Check: only forward allowed
    updateFields = {
      check_by: actorEmployeeId,
      check_at: new Date().toISOString(),
      check_note: data.note || null,
    };
    const nextStage = chain[currentIdx + 1];
    newStatus = `pending_${nextStage}`;

  } else if (currentStage === 'consent') {
    if (action === 'reject') {
      newStatus = 'rejected';
      updateFields = {
        consent_by: actorEmployeeId,
        consent_at: new Date().toISOString(),
        consent_note: data.note || null,
        consent_action: 'reject',
      };
    } else {
      updateFields = {
        consent_by: actorEmployeeId,
        consent_at: new Date().toISOString(),
        consent_note: data.note || null,
        consent_action: 'forward',
      };
      const nextStage = chain[currentIdx + 1];
      newStatus = `pending_${nextStage}`;
    }

  } else if (currentStage === 'approval') {
    if (action === 'reject') {
      newStatus = 'rejected';
      updateFields = {
        approval_by: actorEmployeeId,
        approval_at: new Date().toISOString(),
        approval_note: data.note || null,
        approval_action: 'reject',
      };
    } else if (action === 'modify') {
      const modified_duration = await calculateWorkingDays(
        app.employee_id, data.modified_start_date, data.modified_end_date
      );
      newStatus = 'approved';
      updateFields = {
        approval_by: actorEmployeeId,
        approval_at: new Date().toISOString(),
        approval_note: data.note || null,
        approval_action: 'modify',
        modified_start_date: data.modified_start_date,
        modified_end_date: data.modified_end_date,
        modified_duration_days: modified_duration,
      };
    } else {
      // accept
      newStatus = 'approved';
      updateFields = {
        approval_by: actorEmployeeId,
        approval_at: new Date().toISOString(),
        approval_note: data.note || null,
        approval_action: 'accept',
      };
    }

    // If approved, deduct from balance
    if (newStatus === 'approved') {
      const finalDays = updateFields.modified_duration_days || app.duration_days;
      const year = new Date(app.start_date).getFullYear();
      await query(
        `UPDATE hr_leave_balances
         SET used_days = used_days + $1
         WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4`,
        [finalDays, app.employee_id, app.leave_type_id, year]
      );
      // Update employee status to 'on_leave'
      await query(
        `UPDATE hr_employees SET status = 'on_leave' WHERE id = $1`,
        [app.employee_id]
      );
    }
  }

  // Build update query
  const fields = Object.keys(updateFields);
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => updateFields[f]);

  await query(
    `UPDATE hr_leave_applications SET ${setClause}, status = $1, updated_at = NOW() WHERE id = $${fields.length + 2}`,
    [newStatus, ...values, applicationId]
  );

  return { success: true, new_status: newStatus };
};

const getLeaveRegister = async (year) => {
  const currentYear = year || new Date().getFullYear();

  // Ensure every active employee has their balances auto-created/synced before reading the register
  const employeesResult = await query(
    `SELECT he.id FROM hr_employees he
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE he.status != 'terminated' AND r.name IS DISTINCT FROM 'super_admin'`
  );
  for (const emp of employeesResult.rows) {
    await getEmployeeBalances(emp.id, currentYear);
  }

 const result = await query(
    `SELECT he.id as employee_id, he.full_name, he.phone, he.designation, he.department, he.joining_date,
            lt.id as leave_type_id, lt.name_bn, lt.code, lt.is_paid, lt.eligibility_months,
            COALESCE(lb.total_days, 0) as total_days,
            COALESCE(lb.used_days, 0) as used_days,
            COALESCE(lb.total_days, 0) - COALESCE(lb.used_days, 0) as remaining_days
     FROM hr_employees he
     CROSS JOIN hr_leave_types lt
     LEFT JOIN hr_leave_balances lb ON lb.employee_id = he.id AND lb.leave_type_id = lt.id AND lb.year = $1
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE he.status != 'terminated' AND r.name IS DISTINCT FROM 'super_admin' AND lt.is_active = TRUE
     ORDER BY he.full_name ASC, lt.created_at ASC`,
    [currentYear]
  );
  return result.rows;
};
const getMyApprovalQueue = async (userId) => {
  // Super admin has no visible hr_employees record by design — use the designated
  // CEO phone number's employee entry to resolve their position for approval purposes.
  const userRoleResult = await query(
    `SELECT r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [userId]
  );
  const isSuperAdmin = userRoleResult.rows[0]?.role === 'super_admin';

  const empResult = isSuperAdmin
    ? await query(`SELECT id, position_id FROM hr_employees WHERE phone = '01805466911'`)
    : await query('SELECT id, position_id FROM hr_employees WHERE user_id = $1', [userId]);

  if (empResult.rows.length === 0) return [];
  const employee = empResult.rows[0];

  const policy = await getLeavePolicy();
  if (!policy) return [];

  const stages = [];
  if (policy.check_position_id && policy.check_position_id === employee.position_id) stages.push('check');
  if (policy.consent_position_id && policy.consent_position_id === employee.position_id) stages.push('consent');
  if (policy.approval_position_id && policy.approval_position_id === employee.position_id) stages.push('approval');

  if (stages.length === 0) return [];

  const statuses = stages.map(s => `pending_${s}`);
  const result = await query(
    `SELECT la.*,
            he.full_name as employee_name, he.designation, he.department,
            lt.name_bn as leave_type_name_bn, lt.code as leave_type_code, lt.is_paid
     FROM hr_leave_applications la
     JOIN hr_employees he ON he.id = la.employee_id
     JOIN hr_leave_types lt ON lt.id = la.leave_type_id
     WHERE la.status = ANY($1)
     ORDER BY la.created_at ASC`,
    [statuses]
  );
  return result.rows;
};

const isApprover = async (userId) => {
  const userRoleResult = await query(
    `SELECT r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [userId]
  );
  const isSuperAdmin = userRoleResult.rows[0]?.role === 'super_admin';

  const empResult = isSuperAdmin
    ? await query(`SELECT position_id FROM hr_employees WHERE phone = '01805466911'`)
    : await query('SELECT position_id FROM hr_employees WHERE user_id = $1', [userId]);

  if (empResult.rows.length === 0 || !empResult.rows[0].position_id) return false;
  const positionId = empResult.rows[0].position_id;

  const policy = await getLeavePolicy();
  if (!policy) return false;

  return [policy.check_position_id, policy.consent_position_id, policy.approval_position_id].includes(positionId);
};


module.exports = {
  getLeaveTypes, createLeaveType, updateLeaveType,
  getLeavePolicy, updateLeavePolicy,
  getEmployeeBalances, getLeaveRegister, getMyApprovalQueue, isApprover,
  applyLeave, getApplications, processApplication,
};