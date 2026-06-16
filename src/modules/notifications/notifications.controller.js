const notificationsService = require('./notifications.service');

const subscribe = async (req, res, next) => {
  try {
    await notificationsService.saveSubscription(req.user.id, req.body);
    res.json({ success: true, message: 'Subscription saved' });
  } catch (err) { next(err); }
};

const getVapidKey = async (req, res) => {
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
};

module.exports = { subscribe, getVapidKey };