const { query, withTransaction } = require('../../config/database');
const attendanceService = require('./attendance.service');

const getActiveDeviceBySerial = async (sn) => {
  if (!sn) return null;
  const result = await query(
    `SELECT * FROM hr_attendance_devices WHERE serial_number = $1 AND is_active = TRUE`,
    [sn]
  );
  return result.rows[0] || null;
};

const touchDevice = async (sn, ip) => {
  await query(
    `UPDATE hr_attendance_devices SET last_seen_at = NOW(), last_ip = $2 WHERE serial_number = $1`,
    [sn, ip]
  );
};

// Raw ATTLOG body: one punch per line, tab-separated: PIN \t "yyyy-MM-dd HH:mm:ss" \t Status \t Verify ...
const parseAttlogLines = (rawBody) => {
  return String(rawBody || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const [pin, time, status, verify] = parts;
      return { pin, time, status, verify, raw: line };
    })
    .filter((p) => p.pin && /^\d+$/.test(p.pin) && p.time && !isNaN(Date.parse(p.time.replace(' ', 'T'))));
};

const processAttlogBatch = async (sn, rawBody) => {
  const lines = parseAttlogLines(rawBody);
  if (lines.length === 0) return 0;

  const inserted = await withTransaction(async (client) => {
    let count = 0;
    for (const p of lines) {
      const empResult = await client.query(
        `SELECT id FROM hr_employees WHERE device_user_id = $1`,
        [p.pin]
      );
      const employeeId = empResult.rows[0]?.id || null;

      const insertResult = await client.query(
        `INSERT INTO hr_device_punches
           (device_serial, device_pin, punch_time, status, verify_mode, raw_line, employee_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (device_serial, device_pin, punch_time) DO NOTHING
         RETURNING id, punch_time`,
        [sn, p.pin, p.time, p.status || null, p.verify || null, p.raw, employeeId]
      );
      if (insertResult.rows.length > 0) count++;
    }
    return count;
  });

  // Reconcile newly-inserted, mapped punches into hr_attendance AFTER the raw-log transaction
  // commits — reconciliation is idempotent/replayable, so it doesn't need to share the transaction.
  const unprocessed = await query(
    `SELECT id, device_pin, punch_time, employee_id FROM hr_device_punches
     WHERE device_serial = $1 AND processed = FALSE AND employee_id IS NOT NULL
     ORDER BY punch_time ASC`,
    [sn]
  );
  for (const row of unprocessed.rows) {
    try {
      await attendanceService.reconcilePunch(row.employee_id, new Date(row.punch_time));
      await query(`UPDATE hr_device_punches SET processed = TRUE, process_error = NULL WHERE id = $1`, [row.id]);
    } catch (err) {
      await query(`UPDATE hr_device_punches SET process_error = $2 WHERE id = $1`, [row.id, err.message]);
    }
  }

  return inserted;
};

module.exports = { getActiveDeviceBySerial, touchDevice, processAttlogBatch, parseAttlogLines };
