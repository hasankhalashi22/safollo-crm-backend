const { query } = require('../../config/database');
const hrService = require('../hr/hr.service');
const { generateToken } = require('../../utils/jwt');

const getUserData = async (userId) => {
  const moduleAccessResult = await query(
    `SELECT ma.module_key, ma.role_key
     FROM hr_employee_module_access ma
     JOIN hr_employees he ON he.id = ma.employee_id
     WHERE he.user_id = $1`,
    [userId]
  );
  const essResult = await query(`SELECT id FROM hr_employees WHERE user_id = $1`, [userId]);
  const hasEss = essResult.rows.length > 0;
  return {
    module_access: moduleAccessResult.rows,
    has_ess: hasEss,
    employee_id: hasEss ? essResult.rows[0].id : null,
  };
};

const loginWithPin = async (phone, pin, deviceInfo) => {
  if (!pin || !/^\d{4}$/.test(pin)) {
    throw { statusCode: 400, message: 'PIN অবশ্যই ৪ সংখ্যার হতে হবে' };
  }

  const userResult = await query(
    `SELECT u.*, r.name as role_name, r.label as role_label, r.level as role_level,
            sp.full_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE u.phone = $1`,
    [phone]
  );

  if (userResult.rows.length === 0) {
    throw { statusCode: 404, message: 'এই নম্বরে কোনো অ্যাকাউন্ট নেই' };
  }

  const user = userResult.rows[0];

  if (!user.is_active) {
    throw { statusCode: 403, message: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে' };
  }

  const currentPin = user.pin || '0000';
  if (pin !== currentPin) {
    throw { statusCode: 401, message: 'PIN ভুল' };
  }

  const token = generateToken({ userId: user.id, phone: user.phone, role: user.role_name });
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO sessions (user_id, token, device_info, expires_at) VALUES ($1, $2, $3, $4)',
    [user.id, token, deviceInfo || null, expiresAt]
  );

  const extra = await getUserData(user.id);

  return {
    token,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role_name,
      role_label: user.role_label,
      role_level: user.role_level,
      full_name: user.full_name,
      is_profile_complete: user.is_profile_complete,
      is_first_login: user.is_first_login,
      pin_changed: user.pin_changed,
      ...extra,
    },
  };
};

const changePin = async (userId, oldPin, newPin) => {
  if (!newPin || !/^\d{4}$/.test(newPin)) {
    throw { statusCode: 400, message: 'PIN অবশ্যই ৪ সংখ্যার হতে হবে' };
  }

  const userResult = await query('SELECT pin FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];

  const currentPin = user.pin || '0000';
  if (oldPin !== currentPin) {
    throw { statusCode: 401, message: 'পুরনো PIN ভুল' };
  }

  if (newPin === '0000') {
    throw { statusCode: 400, message: 'নতুন PIN 0000 হতে পারবে না' };
  }

  await query(
    'UPDATE users SET pin = $1, pin_changed = TRUE, is_first_login = FALSE WHERE id = $2',
    [newPin, userId]
  );

  return { success: true, message: 'PIN পরিবর্তন হয়েছে' };
};

const resetPin = async (userId) => {
  await query(
    'UPDATE users SET pin = $1, pin_changed = FALSE WHERE id = $2',
    ['0000', userId]
  );
  return { success: true, message: 'PIN রিসেট হয়েছে। নতুন PIN: 0000' };
};

const logout = async (token) => {
  await query('DELETE FROM sessions WHERE token = $1', [token]);
  return { message: 'সফলভাবে লগআউট হয়েছে' };
};

const getMe = async (userId) => {
  const result = await query(
    `SELECT u.id, u.phone, u.joining_date, u.is_active, u.is_profile_complete,
            u.is_first_login, u.pin_changed,
            r.name as role, r.label as role_label, r.level as role_level,
            sp.*,
            m.id as manager_id,
            msp.full_name as manager_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN users m ON m.id = u.manager_id
     LEFT JOIN staff_profiles msp ON msp.user_id = m.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw { statusCode: 404, message: 'ব্যবহারকারী পাওয়া যায়নি' };
  }

  const essResult = await query(
    `SELECT id, employment_type FROM hr_employees WHERE user_id = $1`, [userId]
  );
  const moduleAccessResult = await query(
    `SELECT ma.module_key, ma.role_key
     FROM hr_employee_module_access ma
     JOIN hr_employees he ON he.id = ma.employee_id
     WHERE he.user_id = $1`, [userId]
  );

  const userData = result.rows[0];
  userData.has_ess = essResult.rows.length > 0;
  userData.employee_id = userData.has_ess ? essResult.rows[0].id : null;
  userData.employment_type = userData.has_ess ? essResult.rows[0].employment_type : null;
  userData.module_access = moduleAccessResult.rows;

  return userData;
};

module.exports = { loginWithPin, changePin, resetPin, logout, getMe };
