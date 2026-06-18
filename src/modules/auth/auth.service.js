const { query } = require('../../config/database');
const hrService = require('../hr/hr.service');
const { generateToken } = require('../../utils/jwt');
const { generateOTP, sendSMS } = require('../../utils/sms');
const bcrypt = require('bcryptjs');

const OTP_EXPIRES_MINUTES = parseInt(process.env.OTP_EXPIRES_MINUTES) || 5;

const sendOtp = async (phone) => {
  console.log('Looking for phone:', phone);
  const userResult = await query(
    'SELECT id, is_active FROM users WHERE phone = $1',
    [phone]
  );
  console.log('User found:', userResult.rows.length);

  if (userResult.rows.length === 0) {
    throw { statusCode: 404, message: 'এই নম্বরে কোনো অ্যাকাউন্ট নেই। অ্যাডমিনের সাথে যোগাযোগ করুন।' };
  }

  if (!userResult.rows[0].is_active) {
    throw { statusCode: 403, message: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে' };
  }

  await query(
    'UPDATE otp_codes SET is_used = TRUE WHERE phone = $1 AND is_used = FALSE',
    [phone]
  );

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

  await query(
    'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)',
    [phone, code, expiresAt]
  );

  const message = `সাফল্য একাডেমি CRM\nআপনার OTP: ${code}\nমেয়াদ: ${OTP_EXPIRES_MINUTES} মিনিট\nকাউকে শেয়ার করবেন না।`;
  await sendSMS(phone, message);

  return { message: `${phone} নম্বরে OTP পাঠানো হয়েছে` };
};

const verifyOtp = async (phone, code, deviceInfo) => {
  const otpResult = await query(
    `SELECT * FROM otp_codes
     WHERE phone = $1 AND is_used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );

  if (otpResult.rows.length === 0) {
    throw { statusCode: 400, message: 'OTP ভুল অথবা মেয়াদ শেষ হয়ে গেছে' };
  }

  await query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);

  const userResult = await query(
    `SELECT u.*, r.name as role_name, r.label as role_label, r.level as role_level,
            sp.full_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE u.phone = $1`,
    [phone]
  );

  const user = userResult.rows[0];
  const token = generateToken({ userId: user.id, phone: user.phone, role: user.role_name });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO sessions (user_id, token, device_info, expires_at) VALUES ($1, $2, $3, $4)',
    [user.id, token, deviceInfo || null, expiresAt]
  );

  const otpModuleAccessResult = await query(
    `SELECT ma.module_key, ma.role_key
     FROM hr_employee_module_access ma
     JOIN hr_employees he ON he.id = ma.employee_id
     WHERE he.user_id = $1`,
    [user.id]
  );

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
      module_access: otpModuleAccessResult.rows,
    },
  };
};

const verifyOtpFirstLogin = async (phone, code) => {
  const otpResult = await query(
    `SELECT * FROM otp_codes
     WHERE phone = $1 AND is_used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );

  if (otpResult.rows.length === 0) {
    throw { statusCode: 400, message: 'OTP ভুল অথবা মেয়াদ শেষ হয়ে গেছে' };
  }

  await query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);
  return { success: true, message: 'OTP verified. এখন পাসওয়ার্ড সেট করুন।', phone };
};

const setPassword = async (phone, password) => {
  if (password.length !== 4 || !/^\d{4}$/.test(password)) {
    throw { statusCode: 400, message: 'পাসওয়ার্ড অবশ্যই ৪ সংখ্যার হতে হবে' };
  }

  const hashed = await bcrypt.hash(password, 10);
  await query(
    'UPDATE users SET password = $1, is_first_login = FALSE WHERE phone = $2',
    [hashed, phone]
  );

  return { success: true, message: 'পাসওয়ার্ড সেট হয়েছে। এখন লগইন করুন।' };
};

const loginWithPassword = async (phone, password, deviceInfo) => {
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

 if (!user.password) {
    throw { statusCode: 428, message: 'প্রথমবার লগইন। OTP দিয়ে verify করুন।', is_first_login: true };
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw { statusCode: 401, message: 'পাসওয়ার্ড ভুল' };
  }

  const token = generateToken({ userId: user.id, phone: user.phone, role: user.role_name });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO sessions (user_id, token, device_info, expires_at) VALUES ($1, $2, $3, $4)',
    [user.id, token, deviceInfo || null, expiresAt]
  );

const moduleAccessResult = await query(
    `SELECT ma.module_key, ma.role_key
     FROM hr_employee_module_access ma
     JOIN hr_employees he ON he.id = ma.employee_id
     WHERE he.user_id = $1`,
    [user.id]
  );

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
      module_access: moduleAccessResult.rows,
    },
  };
};

const changePassword = async (userId, oldPassword, newPassword) => {
  if (newPassword.length !== 4 || !/^\d{4}$/.test(newPassword)) {
    throw { statusCode: 400, message: 'পাসওয়ার্ড অবশ্যই ৪ সংখ্যার হতে হবে' };
  }

  const userResult = await query('SELECT password FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];

  if (user.password) {
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) throw { statusCode: 401, message: 'পুরনো পাসওয়ার্ড ভুল' };
  }

const hashed = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password = $1, is_first_login = FALSE WHERE id = $2', [hashed, userId]);

  return { success: true, message: 'পাসওয়ার্ড পরিবর্তন হয়েছে' };
};

const resetPassword = async (userId) => {
  await query(
    'UPDATE users SET password = NULL, is_first_login = TRUE WHERE id = $1',
    [userId]
  );
  return { success: true, message: 'পাসওয়ার্ড রিসেট হয়েছে।' };
};

const logout = async (token) => {
  await query('DELETE FROM sessions WHERE token = $1', [token]);
  return { message: 'সফলভাবে লগআউট হয়েছে' };
};

const getMe = async (userId) => {
  const result = await query(
    `SELECT u.id, u.phone, u.joining_date, u.is_active, u.is_profile_complete, u.is_first_login,
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

  return result.rows[0];
};

module.exports = { sendOtp, verifyOtp, verifyOtpFirstLogin, setPassword, loginWithPassword, changePassword, resetPassword, logout, getMe };