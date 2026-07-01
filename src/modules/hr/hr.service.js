const { query } = require('../../config/database');
const usersService = require('../users/users.service');

// ===== Employee Management (hr_employees master table) =====

const getEmployees = async () => {
  const result = await query(
    `WITH RECURSIVE position_tiers AS (
       SELECT id, 0 as tier FROM hr_positions WHERE parent_position_id IS NULL
       UNION ALL
       SELECT p.id, pt.tier + 1
       FROM hr_positions p
       JOIN position_tiers pt ON p.parent_position_id = pt.id
     )
     SELECT he.*, pos.title as position_title,
            mgr.full_name as reports_to_name,
            u.phone as crm_phone, r.label as crm_role_label,
            COALESCE(pt.tier, 999) as position_tier
     FROM hr_employees he
     LEFT JOIN hr_positions pos ON pos.id = he.position_id
     LEFT JOIN position_tiers pt ON pt.id = he.position_id
     LEFT JOIN hr_employees mgr ON mgr.id = he.reports_to
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE r.name IS DISTINCT FROM 'super_admin'
       AND he.status IN ('active', 'on_leave')
     ORDER BY position_tier ASC, he.full_name ASC`
  );

  const employees = result.rows;
  if (employees.length === 0) return employees;

  const accessResult = await query(
    `SELECT employee_id, module_key, role_key FROM hr_employee_module_access`
  );

  const accessByEmployee = {};
  accessResult.rows.forEach(a => {
    if (!accessByEmployee[a.employee_id]) accessByEmployee[a.employee_id] = [];
    accessByEmployee[a.employee_id].push({ module_key: a.module_key, role_key: a.role_key });
  });

  return employees.map(emp => ({
    ...emp,
    module_access: accessByEmployee[emp.id] || [],
  }));
};

const getEmployeeById = async (id) => {
  const result = await query(
    `SELECT he.*, pos.title as position_title, mgr.full_name as reports_to_name
     FROM hr_employees he
     LEFT JOIN hr_positions pos ON pos.id = he.position_id
     LEFT JOIN hr_employees mgr ON mgr.id = he.reports_to
     WHERE he.id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'কর্মী পাওয়া যায়নি' };
  return result.rows[0];
};

// Search existing CRM users not yet linked to an hr_employees record (for "import from CRM" flow)
const getUnlinkedCrmUsers = async () => {
  const result = await query(
    `SELECT u.id, u.phone, sp.full_name, r.label as role_label
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = TRUE
       AND r.name IS DISTINCT FROM 'super_admin'
       AND u.id NOT IN (SELECT user_id FROM hr_employees WHERE user_id IS NOT NULL)
     ORDER BY sp.full_name ASC NULLS LAST`
  );
  return result.rows;
};

const createEmployee = async (data, createdBy) => {
  const {
    full_name, phone, email, user_id, position_id, designation, department,
    reports_to, employment_type, office_start_time, office_end_time, is_remote,
    weekly_off_day, basic_salary, status, joining_date,
    grant_crm_access, crm_role_id, crm_manager_id, grant_basic_login
  } = data;

  if (!full_name) throw { statusCode: 400, message: 'নাম দিন' };

  let finalUserId = user_id || null;

  // If granting CRM access for a brand-new employee (not importing an existing CRM user)
  if (grant_crm_access && !finalUserId) {
    if (!phone || !crm_role_id) {
      throw { statusCode: 400, message: 'CRM access দেওয়ার জন্য ফোন নম্বর ও role আবশ্যক' };
    }
    const newUser = await usersService.createUser(
      { phone, role_id: crm_role_id, manager_id: crm_manager_id || null, joining_date: joining_date || null },
      createdBy
    );
    finalUserId = newUser.id;
  }

  // If granting only basic ESS-portal login (no CRM module access)
  if (grant_basic_login && !grant_crm_access && !finalUserId) {
    if (!phone) {
      throw { statusCode: 400, message: 'ESS Portal access দেওয়ার জন্য ফোন নম্বর আবশ্যক' };
    }
    const employeeRole = await query("SELECT id FROM roles WHERE name = 'employee'");
    if (employeeRole.rows.length === 0) {
      throw { statusCode: 500, message: 'Employee role পাওয়া যায়নি, আগে server migration নিশ্চিত করুন' };
    }
    const newUser = await usersService.createUser(
      { phone, role_id: employeeRole.rows[0].id, manager_id: null, joining_date: joining_date || null },
      createdBy
    );
    finalUserId = newUser.id;
  }
  const result = await query(
    `INSERT INTO hr_employees
       (full_name, phone, email, user_id, position_id, designation, department,
        reports_to, employment_type, office_start_time, office_end_time, is_remote,
        weekly_off_day, basic_salary, status, joining_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [full_name, phone || null, email || null, finalUserId, position_id || null,
     designation || null, department || null, reports_to || null,
     employment_type || 'full_time', office_start_time || '11:00', office_end_time || '21:00',
     is_remote || false, weekly_off_day || null, basic_salary || null,
     status || 'active', joining_date || null]
  );
  return result.rows[0];
};

const updateEmployee = async (id, data) => {
  const allowedFields = [
    'full_name', 'phone', 'email', 'position_id', 'designation', 'department',
    'reports_to', 'employment_type', 'office_start_time', 'office_end_time',
    'is_remote', 'weekly_off_day', 'basic_salary', 'status', 'joining_date',
    'father_name', 'mother_name', 'date_of_birth', 'blood_group', 'gender',
    'guardian_mobile', 'guardian_relation', 'present_address', 'permanent_address',
    'education_level', 'education_details', 'nid_number', 'is_locked',
    'nid_image_url', 'nid_image_public_id', 'photo_url', 'photo_public_id',
    'signature_url', 'signature_public_id',
    'resignation_date', 'termination_date', 'exit_reason',
  ];
const numericFields = ['basic_salary'];
  const dateFields = ['joining_date', 'date_of_birth', 'resignation_date', 'termination_date'];
  const booleanFields = ['is_remote', 'is_locked'];
  const uuidFields = ['position_id', 'reports_to'];

  // Lock check: if employee is locked, reject updates unless explicitly unlocking
  const current = await query('SELECT is_locked FROM hr_employees WHERE id = $1', [id]);
  if (current.rows.length === 0) throw { statusCode: 404, message: 'কর্মী পাওয়া যায়নি' };
  if (current.rows[0].is_locked && data.is_locked !== false && data.__fromHR !== true) {
    throw { statusCode: 403, message: 'এই প্রোফাইল লক করা আছে। HR থেকে আনলক করুন।' };
  }

  const fields = [];
  const params = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      let value = data[field];
      if ((numericFields.includes(field) || dateFields.includes(field) || uuidFields.includes(field)) && value === '') {
        value = null;
      }
      fields.push(`${field} = $${idx++}`);
      params.push(value);
    }
  }

  if (fields.length === 0) throw { statusCode: 400, message: 'কোনো তথ্য দেওয়া হয়নি' };
  fields.push('updated_at = NOW()');

  const result = await query(
    `UPDATE hr_employees SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    [...params, id]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'কর্মী পাওয়া যায়নি' };
  return result.rows[0];
};

const deleteEmployee = async (id) => {
  await query('DELETE FROM hr_employees WHERE id = $1', [id]);
};

const getEmployeeHistory = async () => {
  const result = await query(
    `SELECT he.*, hp.title as position_title,
            mgr.full_name as reports_to_name,
            u.phone as crm_phone, r.label as crm_role_label
     FROM hr_employees he
     LEFT JOIN hr_positions hp ON hp.id = he.position_id
     LEFT JOIN hr_employees mgr ON mgr.id = he.reports_to
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE he.status IN ('resigned', 'terminated')
     ORDER BY he.updated_at DESC`
  );
  return result.rows;
};

// ===== Organogram (Positions) =====

const getPositions = async () => {
  const positionsResult = await query(
    `SELECT id, title, department, parent_position_id FROM hr_positions ORDER BY created_at ASC`
  );
 const employeesResult = await query(
    `SELECT he.id, he.full_name, he.position_id
     FROM hr_employees he
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE he.position_id IS NOT NULL AND he.status = 'active'
       AND r.name IS DISTINCT FROM 'super_admin'`
  );


  const positions = positionsResult.rows.map(p => ({
    ...p,
    employees: employeesResult.rows.filter(e => e.position_id === p.id).map(e => ({ user_id: e.id, full_name: e.full_name })),
  }));

  return positions;
};

const createPosition = async (data) => {
  const { title, parent_position_id, department } = data;
  if (!title) throw { statusCode: 400, message: 'পদের নাম দিন' };
  const result = await query(
    `INSERT INTO hr_positions (title, parent_position_id, department) VALUES ($1, $2, $3) RETURNING *`,
    [title, parent_position_id || null, department || null]
  );
  return result.rows[0];
};

const updatePosition = async (id, data) => {
  const { title, department } = data;
  const result = await query(
    `UPDATE hr_positions SET title = $1, department = $2 WHERE id = $3 RETURNING *`,
    [title, department || null, id]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'পদ পাওয়া যায়নি' };
  return result.rows[0];
};

const deletePosition = async (id) => {
  const children = await query(`SELECT id FROM hr_positions WHERE parent_position_id = $1`, [id]);
  if (children.rows.length > 0) {
    throw { statusCode: 400, message: 'এই পদের নিচে আরও পদ আছে, আগে সেগুলো ডিলিট করুন' };
  }
  await query(`UPDATE hr_employees SET position_id = NULL WHERE position_id = $1`, [id]);
  await query(`DELETE FROM hr_positions WHERE id = $1`, [id]);
};

// ===== Organogram (legacy, kept for backward compatibility if referenced) =====

const getOrganogram = async () => {
  const result = await query(
    `SELECT he.id, he.full_name, he.designation, he.department, he.reports_to
     FROM hr_employees he
     LEFT JOIN users u ON u.id = he.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE he.status = 'active' AND r.name IS DISTINCT FROM 'super_admin'
     ORDER BY he.full_name ASC`
  );
  return result.rows;
};

// ===== Notice Board =====

const getNotices = async () => {
  const result = await query(
    `SELECT n.*, sp.full_name as created_by_name
     FROM hr_notices n
     LEFT JOIN staff_profiles sp ON sp.user_id = n.created_by
     ORDER BY CASE n.category WHEN 'urgent' THEN 0 ELSE 1 END, n.created_at DESC`
  );
  return result.rows;
};

const createNotice = async (data, userId) => {
  const { title, content, attachment_url, category } = data;
  const result = await query(
    `INSERT INTO hr_notices (title, content, attachment_url, category, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [title, content, attachment_url || null, category || 'general', userId]
  );
  return result.rows[0];
};

const deleteNotice = async (id) => {
  await query('DELETE FROM hr_notices WHERE id = $1', [id]);
};

// ===== Module Access (central role/permission assignment) =====

const getEmployeeModuleAccess = async (employeeId) => {
  const result = await query(
    `SELECT module_key, role_key FROM hr_employee_module_access WHERE employee_id = $1`,
    [employeeId]
  );
  return result.rows;
};

const setEmployeeModuleAccess = async (employeeId, accessList) => {
  // accessList = [{ module_key, role_key }, ...] — full replace of this employee's access
  await query('DELETE FROM hr_employee_module_access WHERE employee_id = $1', [employeeId]);

  for (const { module_key, role_key } of accessList) {
    if (!module_key || !role_key) continue;
    await query(
      `INSERT INTO hr_employee_module_access (employee_id, module_key, role_key)
       VALUES ($1, $2, $3)`,
      [employeeId, module_key, role_key]
    );
  }

  // Special case: if CRM access is being set, also keep the legacy users.role_id in sync
  // so existing CRM login/authorization (which still reads users.role_id) keeps working.
  const crmAccess = accessList.find(a => a.module_key === 'crm');
  const employee = await query('SELECT user_id FROM hr_employees WHERE id = $1', [employeeId]);
  const userId = employee.rows[0]?.user_id;

  if (userId && crmAccess) {
    const roleRow = await query('SELECT id FROM roles WHERE name = $1', [crmAccess.role_key]);
    if (roleRow.rows.length > 0) {
      await query('UPDATE users SET role_id = $1 WHERE id = $2', [roleRow.rows[0].id, userId]);
    }
  }

  return getEmployeeModuleAccess(employeeId);
};

const getHolidays = async (year) => {
  const y = year || new Date().getFullYear();
  const result = await query(
    `SELECT * FROM hr_office_holidays WHERE EXTRACT(YEAR FROM date) = $1 ORDER BY date ASC`,
    [y]
  );
  return result.rows;
};

const createHoliday = async (data) => {
  const { date, name, name_bn } = data;
  if (!date || !name) throw { statusCode: 400, message: 'তারিখ ও নাম দিন' };
  const result = await query(
    `INSERT INTO hr_office_holidays (date, name, name_bn) VALUES ($1,$2,$3) RETURNING *`,
    [date, name, name_bn || null]
  );
  return result.rows[0];
};

const deleteHoliday = async (id) => {
  await query('DELETE FROM hr_office_holidays WHERE id = $1', [id]);
};

// Link existing CRM user to employee record (grants ESS access)
const linkEssUser = async (employeeId, userId) => {
  const existing = await query('SELECT id FROM hr_employees WHERE user_id = $1 AND id != $2', [userId, employeeId]);
  if (existing.rows.length > 0) {
    throw { statusCode: 409, message: 'এই CRM User আরেকজন কর্মীর সাথে লিঙ্ক করা আছে' };
  }
  const result = await query(
    'UPDATE hr_employees SET user_id = $1 WHERE id = $2 RETURNING *',
    [userId, employeeId]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'কর্মী পাওয়া যায়নি' };
  return result.rows[0];
};

// Remove ESS link (does not delete the CRM user, just unlinks)
const unlinkEssUser = async (employeeId) => {
  const result = await query(
    'UPDATE hr_employees SET user_id = NULL WHERE id = $1 RETURNING *',
    [employeeId]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'কর্মী পাওয়া যায়নি' };
  return result.rows[0];
};

// Create a basic ESS-only login for an employee who has no CRM account yet
const createEssLogin = async (employeeId, createdBy) => {
  const empResult = await query('SELECT * FROM hr_employees WHERE id = $1', [employeeId]);
  if (empResult.rows.length === 0) throw { statusCode: 404, message: 'কর্মী পাওয়া যায়নি' };
  const emp = empResult.rows[0];

  if (emp.user_id) throw { statusCode: 409, message: 'এই কর্মীর ইতোমধ্যে একটি ESS Account আছে' };
  if (!emp.phone) throw { statusCode: 400, message: 'ESS Account তৈরি করতে কর্মীর ফোন নম্বর আবশ্যক' };

  const employeeRole = await query("SELECT id FROM roles WHERE name = 'employee'");
  if (employeeRole.rows.length === 0) throw { statusCode: 500, message: "Employee role পাওয়া যায়নি" };

  const newUser = await usersService.createUser(
    { phone: emp.phone, role_id: employeeRole.rows[0].id, manager_id: null, joining_date: emp.joining_date || null },
    createdBy
  );
  await query('UPDATE hr_employees SET user_id = $1 WHERE id = $2', [newUser.id, employeeId]);
  return { user_id: newUser.id, phone: emp.phone };
};

const getDashboardStats = async () => {
  const today = new Date().toISOString().split('T')[0];
  const year = new Date().getFullYear();

  const [empCount, todayAtt, onLeave, pendingLeave, holidays, notices] = await Promise.all([
    query(`SELECT COUNT(*) FROM hr_employees WHERE status = 'active'`),
    query(`SELECT COUNT(*) FROM hr_attendance WHERE date = $1`, [today]),
    query(`SELECT COUNT(*) FROM hr_leave_applications WHERE status = 'approved' AND start_date <= $1 AND end_date >= $1`, [today]),
    query(`SELECT COUNT(*) FROM hr_leave_applications WHERE status = 'pending'`),
    query(`SELECT id, name, date FROM hr_office_holidays WHERE EXTRACT(YEAR FROM date) = $1 AND date >= $2 ORDER BY date ASC LIMIT 4`, [year, today]),
    query(`SELECT id, title, content, category, created_at, attachment_url FROM hr_notices ORDER BY created_at DESC LIMIT 3`),
  ]);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekAtt = await query(
    `SELECT date, COUNT(*) as count FROM hr_attendance WHERE date >= $1 AND date <= $2 GROUP BY date`,
    [weekStartStr, today]
  );

  return {
    total_employees: parseInt(empCount.rows[0].count),
    today_present: parseInt(todayAtt.rows[0].count),
    on_leave_today: parseInt(onLeave.rows[0].count),
    pending_leave: parseInt(pendingLeave.rows[0].count),
    week_attendance: weekAtt.rows,
    upcoming_holidays: holidays.rows,
    recent_notices: notices.rows,
  };
};

module.exports = {
  getEmployees, getEmployeeById, getEmployeeHistory, getUnlinkedCrmUsers, createEmployee, updateEmployee, deleteEmployee,
  getEmployeeModuleAccess, setEmployeeModuleAccess,
  getPositions, createPosition, updatePosition, deletePosition, getOrganogram, getHolidays, createHoliday, deleteHoliday, getNotices, createNotice, deleteNotice,
  getDashboardStats,
  linkEssUser, unlinkEssUser, createEssLogin, syncAllProfilesFromStaffProfiles,
};

async function syncAllProfilesFromStaffProfiles() {
  const result = await query(
    `UPDATE hr_employees he
     SET full_name       = COALESCE(sp.full_name, he.full_name),
         father_name     = COALESCE(sp.father_name, he.father_name),
         mother_name     = COALESCE(sp.mother_name, he.mother_name),
         date_of_birth   = COALESCE(sp.date_of_birth, he.date_of_birth),
         blood_group     = COALESCE(sp.blood_group, he.blood_group),
         gender          = COALESCE(sp.gender, he.gender),
         guardian_mobile = COALESCE(sp.guardian_mobile, he.guardian_mobile),
         guardian_relation = COALESCE(sp.guardian_relation, he.guardian_relation),
         email           = COALESCE(sp.email, he.email),
         present_address = COALESCE(sp.present_address, he.present_address),
         permanent_address = COALESCE(sp.permanent_address, he.permanent_address),
         education_level = COALESCE(sp.education_level, he.education_level),
         education_details = COALESCE(sp.education_details, he.education_details),
         nid_number      = COALESCE(sp.nid_number, he.nid_number),
         photo_url       = COALESCE(sp.photo_url, he.photo_url),
         photo_public_id = COALESCE(sp.photo_public_id, he.photo_public_id)
     FROM staff_profiles sp
     WHERE sp.user_id = he.user_id
       AND he.user_id IS NOT NULL
     RETURNING he.id`,
  );
  return { synced: result.rows.length };
}