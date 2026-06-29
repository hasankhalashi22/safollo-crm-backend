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

// Fields that exist in both staff_profiles and hr_employees with the same name
const HR_SYNC_FIELDS = [
  'full_name', 'email', 'father_name', 'mother_name', 'date_of_birth',
  'blood_group', 'gender', 'guardian_mobile', 'guardian_relation',
  'present_address', 'permanent_address', 'education_level', 'education_details',
  'nid_number', 'nid_image_url', 'nid_image_public_id',
  'photo_url', 'photo_public_id', 'signature_url', 'signature_public_id',
];

const syncToHrEmployee = async (userId, data) => {
  const syncData = {};
  HR_SYNC_FIELDS.forEach(f => { if (f in data) syncData[f] = data[f]; });
  if (Object.keys(syncData).length === 0) return;
  const keys = Object.keys(syncData);
  const setClause = keys.map((f, i) => `${f} = $${i + 2}`).join(', ');
  try {
    await query(
      `UPDATE hr_employees SET ${setClause} WHERE user_id = $1`,
      [userId, ...keys.map(f => syncData[f])]
    );
  } catch (err) {
    console.error('HR employee sync failed:', err.message);
  }
};

const STAFF_PROFILE_FIELDS = [
  'full_name', 'father_name', 'mother_name', 'date_of_birth', 'blood_group', 'gender',
  'mobile_number', 'guardian_mobile', 'guardian_relation', 'email',
  'present_address', 'permanent_address', 'education_level', 'education_details', 'nid_number',
];

const updateProfile = async (userId, data) => {
  await checkProfileNotLocked(userId);
  // Only update columns that exist in staff_profiles
  const filtered = {};
  STAFF_PROFILE_FIELDS.forEach(f => { if (f in data) filtered[f] = data[f] === '' ? null : data[f]; });
  const fields = Object.keys(filtered);
  if (fields.length === 0) {
    throw { statusCode: 400, message: 'কোনো তথ্য দেওয়া হয়নি' };
  }

  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => filtered[f]);

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

  // Sync overlapping fields to hr_employees if this user is linked
  await syncToHrEmployee(userId, filtered);

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

  await syncToHrEmployee(userId, { photo_url: file.path, photo_public_id: file.filename });

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

  await syncToHrEmployee(userId, { nid_image_url: file.path, nid_image_public_id: file.filename });

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

  await syncToHrEmployee(userId, { signature_url: file.path, signature_public_id: file.filename });

  return result.rows[0];
};

module.exports = { getProfile, updateProfile, uploadPhoto, uploadNid, uploadSignature };
