const webpush = require('web-push');
const { query } = require('../../config/database');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const saveSubscription = async (userId, subscription) => {
  const subString = typeof subscription === 'string' ? subscription : JSON.stringify(subscription);
  await query(
    `INSERT INTO push_subscriptions (user_id, subscription)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET subscription = $2, updated_at = NOW()`,
    [userId, subString]
  );
};

const sendNotification = async (userId, title, body, data = {}) => {
  try {
    const result = await query(
      'SELECT subscription FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) return;
  const subData = result.rows[0].subscription;
const subscription = typeof subData === 'string' ? JSON.parse(subData) : subData;
    const payload = JSON.stringify({ title, body, data });
    await webpush.sendNotification(subscription, payload);
  } catch (err) {
    console.error('Push notification error:', err.message);
    if (err.statusCode === 410) {
      await query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
    }
  }
};

const sendToApprovers = async (title, body, data = {}) => {
  try {
    const result = await query(
      `SELECT ps.user_id FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE r.level <= 3 AND u.is_active = TRUE`
    );
    for (const row of result.rows) {
      await sendNotification(row.user_id, title, body, data);
    }
  } catch (err) {
    console.error('Send to approvers error:', err.message);
  }
};

const sendToUser = async (userId, title, body, data = {}) => {
  await sendNotification(userId, title, body, data);
};

module.exports = { saveSubscription, sendToApprovers, sendToUser };