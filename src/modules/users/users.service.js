const { query } = require('../../config/database');

// Create new user (admin only)
const createUser = async (data, createdBy) => {
  const { phone, role_id, manager_id, joining_date } = data;

  const result = await query(
    `INSERT INTO users (phone, role_id, manager_id, joining_date, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, phone, role_id, is_active, joining_date, created_at`,
    [phone, role_id, manager_id || null, joining_date || null, createdBy]
  );

  // Create empty profile
  await query(
    'INSERT INTO staff_profiles (user_id) VALUES ($1)',
    [result.rows[0].id]
  );

  return result.rows[0];
};

// Get all users (with filters)
const getUsers = async ({ role, is_active, manager_id, page = 1, limit = 20 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (role) {
    conditions.push(`r.name = $${idx++}`);
    params.push(role);
  }
  if (is_active !== undefined) {
    conditions.push(`u.is_active = $${idx++}`);
    params.push(is_active);
  }
  if (manager_id) {
    conditions.push(`u.manager_id = $${idx++}`);
    params.push(manager_id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT u.id, u.phone, u.is_active, u.joining_date, u.is_profile_complete,
            r.name as role, r.label as role_label, r.level as role_level,
            sp.full_name, sp.photo_url,
            m_sp.full_name as manager_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN users m ON m.id = u.manager_id
     LEFT JOIN staff_profiles m_sp ON m_sp.user_id = m.id
     ${where}
     ORDER BY r.level ASC, u.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id ${where}`,
    params
  );

  return {
    data:  result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
  };
};

// Get single user
const getUserById = async (userId) => {
  const result = await query(
    `SELECT u.id, u.phone, u.is_active, u.joining_date, u.is_profile_complete,
            r.name as role, r.label as role_label, r.level as role_level,
            sp.*
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw { statusCode: 404, message: 'ব্যবহারকারী পাওয়া যায়নি' };
  }

  return result.rows[0];
};

// Toggle active/inactive
const toggleActive = async (userId, adminId) => {
  const result = await query(
    `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1 AND id != $2
     RETURNING id, is_active`,
    [userId, adminId] // Admin নিজেকে deactivate করতে পারবে না
  );

  if (result.rows.length === 0) {
    throw { statusCode: 400, message: 'এই কাজ করা সম্ভব নয়' };
  }

  return result.rows[0];
};

// Update role or manager
const updateUser = async (userId, data) => {
  const { role_id, manager_id, joining_date } = data;
  const result = await query(
    `UPDATE users SET
       role_id = COALESCE($1, role_id),
       manager_id = COALESCE($2, manager_id),
       joining_date = COALESCE($3, joining_date),
       updated_at = NOW()
     WHERE id = $4
     RETURNING id, phone, role_id, manager_id, joining_date`,
    [role_id, manager_id, joining_date, userId]
  );

  return result.rows[0];
};

// Get all roles
const getRoles = async () => {
  const result = await query('SELECT * FROM roles ORDER BY level ASC');
  return result.rows;
};
// Create dynamic role
const createRole = async (data) => {
  const { name, label, level, permissions } = data;
  const result = await query(
    `INSERT INTO roles (name, label, level, permissions, is_system)
     VALUES ($1, $2, $3, $4, FALSE) RETURNING *`,
    [name, label, level || 4, JSON.stringify(permissions || [])]
  );
  return result.rows[0];
};

// Update role permissions
const updateRole = async (id, data) => {
  const { label, permissions } = data;
  const result = await query(
    `UPDATE roles SET
       label = COALESCE($1, label),
       permissions = COALESCE($2, permissions)
     WHERE id = $3 AND is_system = FALSE RETURNING *`,
    [label, permissions ? JSON.stringify(permissions) : null, id]
  );
  if (result.rows.length === 0) throw { statusCode: 400, message: 'System role পরিবর্তন করা যাবে না' };
  return result.rows[0];
};

// Delete role
const deleteRole = async (id) => {
  const result = await query(
    `DELETE FROM roles WHERE id = $1 AND is_system = FALSE RETURNING id`,
    [id]
  );
  if (result.rows.length === 0) throw { statusCode: 400, message: 'System role মুছে ফেলা যাবে না' };
  return { deleted: true };
};
const deleteUser = async (id) => {
  await query('DELETE FROM payments WHERE enrollment_id IN (SELECT id FROM enrollments WHERE executive_id = $1)', [id]);
  await query('DELETE FROM enrollments WHERE executive_id = $1', [id]);
  await query('DELETE FROM sessions WHERE user_id = $1', [id]);
  await query('DELETE FROM otp_codes WHERE phone = (SELECT phone FROM users WHERE id = $1)', [id]);
  await query('DELETE FROM staff_profiles WHERE user_id = $1', [id]);
await query('UPDATE users SET manager_id = NULL WHERE manager_id = $1', [id]);
  await query('UPDATE users SET created_by = NULL WHERE created_by = $1', [id]);
  await query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [id]);
  await query('UPDATE enrollments SET approved_by = NULL WHERE approved_by = $1', [id]);
  await query('UPDATE enrollments SET rejected_by = NULL WHERE rejected_by = $1', [id]);
  await query('UPDATE payments SET approved_by = NULL WHERE approved_by = $1', [id]);
  await query('UPDATE payments SET rejected_by = NULL WHERE rejected_by = $1', [id]);
  const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw { statusCode: 404, message: 'স্টাফ পাওয়া যায়নি' };
  return { deleted: true };
};
module.exports = { createUser, getUsers, getUserById, toggleActive, updateUser, getRoles, createRole, updateRole, deleteRole, deleteUser };