const { query } = require('../../config/database');

// Employee Directory
const getEmployees = async () => {
  const result = await query(
    `SELECT u.id, u.phone, u.is_active, r.label as role_label, r.name as role_name,
            sp.full_name, sp.photo_url, sp.mobile_number, sp.email, sp.joining_date,
            hed.designation, hed.department, hed.reports_to, hed.employment_type,
            hed.office_start_time, hed.office_end_time, hed.is_remote, hed.basic_salary, hed.status,
            hed.position_id, hed.weekly_off_day,
            mgr.full_name as reports_to_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN hr_employee_details hed ON hed.user_id = u.id
     LEFT JOIN staff_profiles mgr ON mgr.user_id = hed.reports_to
     WHERE u.is_active = TRUE
     ORDER BY sp.full_name ASC NULLS LAST`
  );
  return result.rows;
};

const upsertEmployeeDetails = async (userId, data) => {
  const {
    designation, department, reports_to, employment_type,
    office_start_time, office_end_time, is_remote, basic_salary, status, position_id,
    weekly_off_day
  } = data;

  const existing = await query('SELECT id FROM hr_employee_details WHERE user_id = $1', [userId]);

  if (existing.rows.length > 0) {
    const result = await query(
      `UPDATE hr_employee_details SET
         designation = $1, department = $2, reports_to = $3, employment_type = $4,
         office_start_time = $5, office_end_time = $6, is_remote = $7, basic_salary = $8,
         status = $9, position_id = $10, weekly_off_day = $11, updated_at = NOW()
       WHERE user_id = $12 RETURNING *`,
      [designation || null, department || null, reports_to || null, employment_type || 'full_time',
       office_start_time || '11:00', office_end_time || '21:00', is_remote || false,
       basic_salary || null, status || 'active', position_id || null, weekly_off_day || null, userId]
    );
    return result.rows[0];
  } else {
    const result = await query(
      `INSERT INTO hr_employee_details
         (user_id, designation, department, reports_to, employment_type,
          office_start_time, office_end_time, is_remote, basic_salary, status, position_id, weekly_off_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [userId, designation || null, department || null, reports_to || null, employment_type || 'full_time',
       office_start_time || '11:00', office_end_time || '21:00', is_remote || false,
       basic_salary || null, status || 'active', position_id || null, weekly_off_day || null]
    );
    return result.rows[0];
  }
};

// Organogram (hierarchy tree based on reports_to)
const getOrganogram = async () => {
  const result = await query(
    `SELECT u.id, sp.full_name, hed.designation, hed.department, hed.reports_to
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN hr_employee_details hed ON hed.user_id = u.id
     WHERE u.is_active = TRUE
     ORDER BY sp.full_name ASC NULLS LAST`
  );
  return result.rows;
};

// Notice Board
const getNotices = async () => {
  const result = await query(
    `SELECT n.*, sp.full_name as created_by_name
     FROM hr_notices n
     LEFT JOIN staff_profiles sp ON sp.user_id = n.created_by
     ORDER BY n.created_at DESC`
  );
  return result.rows;
};

const createNotice = async (data, userId) => {
  const { title, content, attachment_url } = data;
  const result = await query(
    `INSERT INTO hr_notices (title, content, attachment_url, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [title, content, attachment_url || null, userId]
  );
  return result.rows[0];
};

const deleteNotice = async (id) => {
  await query('DELETE FROM hr_notices WHERE id = $1', [id]);
};

// Positions (Organogram structure)
const getPositions = async () => {
  const positionsResult = await query(
    `SELECT id, title, department, parent_position_id FROM hr_positions ORDER BY created_at ASC`
  );
  const employeesResult = await query(
    `SELECT hed.position_id, sp.full_name, u.id as user_id
     FROM hr_employee_details hed
     JOIN users u ON u.id = hed.user_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE hed.position_id IS NOT NULL AND u.is_active = TRUE`
  );

  const positions = positionsResult.rows.map(p => ({
    ...p,
    employees: employeesResult.rows.filter(e => e.position_id === p.id).map(e => ({ user_id: e.user_id, full_name: e.full_name })),
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
  await query(`UPDATE hr_employee_details SET position_id = NULL WHERE position_id = $1`, [id]);
  await query(`DELETE FROM hr_positions WHERE id = $1`, [id]);
};


module.exports = {
  getEmployees, upsertEmployeeDetails, getOrganogram,
  getNotices, createNotice, deleteNotice,
  getPositions, createPosition, updatePosition, deletePosition,
};