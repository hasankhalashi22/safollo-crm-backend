const { query } = require('../../config/database');

const getFieldConfigs = async () => {
  const result = await query('SELECT * FROM field_configs WHERE is_active = TRUE ORDER BY sort_order ASC');
  return result.rows;
};

const updateFieldConfig = async (fieldKey, data, userId) => {
  const { is_mandatory, is_active } = data;
  const result = await query(
    `UPDATE field_configs SET
       is_mandatory = COALESCE($1, is_mandatory),
       is_active = COALESCE($2, is_active),
       updated_by = $3, updated_at = NOW()
     WHERE field_key = $4 RETURNING *`,
    [is_mandatory, is_active, userId, fieldKey]
  );
  if (result.rows.length === 0) throw { statusCode: 404, message: 'Field পাওয়া যায়নি' };
  return result.rows[0];
};

module.exports = { getFieldConfigs, updateFieldConfig };
