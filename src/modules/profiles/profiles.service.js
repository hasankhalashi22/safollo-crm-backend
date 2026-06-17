// profiles.service.js
const { query } = require('../../config/database');
const { deleteFile } = require('../../config/cloudinary');
const checkProfileNotLocked = async (userId) => {
  const result = await query('SELECT is_locked FROM hr_employees WHERE user_id = $1', [userId]);
  if (result.rows.length > 0 && result.rows[0].is_locked) {
    throw { statusCode: 403, message: 'আপনার প্রোফাইল HR দ্বারা লক করা আছে। পরিবর্তনের জন্য HR-এর সাথে যোগাযোগ করুন।' };
  }
};


const getProfile = async (userId) => {
  const result = await query(
    `SELECT u.id, u.phone, u.joining_date, r.name as role, r.label as role_label,
            sp.*
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw { statusCode: 404, message: 'প্রোফাইল পাওয়া যায়নি' };
  }

  return result.rows[0];
};

const updateProfile = async (userId, data) => {
  await checkProfileNotLocked(userId);
  Object.keys(data).forEach(key => { if (data[key] === '') data[key] = null; });
  const fields = Object.keys(data);
  if (fields.length === 0) {
    throw { statusCode: 400, message: 'কোনো তথ্য দেওয়া হয়নি' };
  }

  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => data[f]);

  const result = await query(
    `UPDATE staff_profiles SET ${setClause}, updated_at = NOW()
     WHERE user_id = $1 RETURNING *`,
    [userId, ...values]
  );

  // Check if profile is complete
  const profile = result.rows[0];
  const requiredFields = ['full_name', 'father_name', 'mother_name', 'date_of_birth',
                           'mobile_number', 'nid_number', 'present_address'];
  const isComplete = requiredFields.every(f => profile[f]);

  if (isComplete) {
    await query(
      'UPDATE users SET is_profile_complete = TRUE WHERE id = $1',
      [userId]
    );
  }

  return profile;
};

const uploadPhoto = async (userId, file) => {
  await checkProfileNotLocked(userId);
  // Delete old photo if exists
  const existing = await query('SELECT photo_public_id FROM staff_profiles WHERE user_id = $1', [userId]);
  if (existing.rows[0]?.photo_public_id) {
    await deleteFile(existing.rows[0].photo_public_id);
  }

  const result = await query(
    `UPDATE staff_profiles SET photo_url = $1, photo_public_id = $2, updated_at = NOW()
     WHERE user_id = $3 RETURNING photo_url`,
    [file.path, file.filename, userId]
  );

  return result.rows[0];
};

const uploadNid = async (userId, file) => {
  await checkProfileNotLocked(userId);
  const existing = await query('SELECT nid_image_public_id FROM staff_profiles WHERE user_id = $1', [userId]);
  if (existing.rows[0]?.nid_image_public_id) {
    await deleteFile(existing.rows[0].nid_image_public_id);
  }

  const result = await query(
    `UPDATE staff_profiles SET nid_image_url = $1, nid_image_public_id = $2, updated_at = NOW()
     WHERE user_id = $3 RETURNING nid_image_url`,
    [file.path, file.filename, userId]
  );

  return result.rows[0];
};

const uploadSignature = async (userId, file) => {
  await checkProfileNotLocked(userId);
  const existing = await query('SELECT signature_public_id FROM staff_profiles WHERE user_id = $1', [userId]);
  if (existing.rows[0]?.signature_public_id) {
    await deleteFile(existing.rows[0].signature_public_id);
  }

  const result = await query(
    `UPDATE staff_profiles SET signature_url = $1, signature_public_id = $2, updated_at = NOW()
     WHERE user_id = $3 RETURNING signature_url`,
    [file.path, file.filename, userId]
  );

  return result.rows[0];
};

module.exports = { getProfile, updateProfile, uploadPhoto, uploadNid, uploadSignature };
