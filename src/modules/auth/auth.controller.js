const authService = require('./auth.service');

const sendOtp = async (req, res, next) => {
  try {
    console.log('Request body:', req.body);
    const phone = req.body?.phone || req.body?.Phone;
    const result = await authService.sendOtp(phone);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { phone, code } = req.body;
    const deviceInfo = req.headers['user-agent'];
    const result = await authService.verifyOtp(phone, code, deviceInfo);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const verifyOtpFirstLogin = async (req, res, next) => {
  try {
    const { phone, code } = req.body;
    const result = await authService.verifyOtpFirstLogin(phone, code);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const setPassword = async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    const result = await authService.setPassword(phone, password);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const loginWithPassword = async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    const deviceInfo = req.headers['user-agent'];
    const result = await authService.loginWithPassword(phone, password, deviceInfo);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const changePassword = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    const result = await authService.changePassword(req.user.id, old_password, new_password);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const result = await authService.resetPassword(req.params.userId);
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

module.exports = { sendOtp, verifyOtp, verifyOtpFirstLogin, setPassword, loginWithPassword, changePassword, resetPassword, logout, getMe };