const authService = require('./auth.service');

const login = async (req, res, next) => {
  try {
    const { phone, pin } = req.body;
    const deviceInfo = req.headers['user-agent'];
    const result = await authService.loginWithPin(phone, pin, deviceInfo);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const changePin = async (req, res, next) => {
  try {
    const { old_pin, new_pin } = req.body;
    const result = await authService.changePin(req.user.id, old_pin, new_pin);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const resetPin = async (req, res, next) => {
  try {
    const result = await authService.resetPin(req.params.userId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await authService.logout(token);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const getMe = async (req, res, next) => {
  try {
    const result = await authService.getMe(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

module.exports = { login, changePin, resetPin, logout, getMe };
