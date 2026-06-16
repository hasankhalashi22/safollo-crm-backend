const { query } = require('../../config/database');

function log({ userId, userName, userRole, action, module, targetId, targetName, oldData, newData, description, ipAddress }) {
  query(
    `INSERT INTO audit_logs
      (user_id, user_name, user_role, action, module, target_id, target_name, old_data, new_data, description, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      userId || null,
      userName || null,
      userRole || null,
      action,
      module,
      targetId || null,
      targetName || null,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      description || null,
      ipAddress || null,
    ]
  ).catch(err => console.error('Audit log error:', err.message));
}

async function getLogs({ page = 1, limit = 50, module, action, user_id, date_from, date_to }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (module) { conditions.push(`module = $${idx++}`); params.push(module); }
  if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
  if (user_id) { conditions.push(`user_id = $${idx++}`); params.push(user_id); }
  if (date_from) { conditions.push(`created_at >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`created_at <= $${idx++}`); params.push(date_to + ' 23:59:59'); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const result = await query(
    `SELECT al.*,
        sp.full_name as staff_name
 FROM audit_logs al
 LEFT JOIN staff_profiles sp ON sp.user_id = al.user_id
 ${where} ORDER BY al.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM audit_logs ${where}`, params
  );

  return {
    data: result.rows,
    total: parseInt(countResult.rows[0].count),
    page, limit,
  };
}

module.exports = { log, getLogs };