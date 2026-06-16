// profiles.controller.js
const profilesService = require('./profiles.service');

const getMyProfile = async (req, res, next) => {
  try {
    const result = await profilesService.getProfile(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getProfileById = async (req, res, next) => {
  try {
    const result = await profilesService.getProfile(req.params.userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const updateMyProfile = async (req, res, next) => {
  try {
    const result = await profilesService.updateProfile(req.user.id, req.validatedBody);
    res.json({ success: true, data: result, message: 'প্রোফাইল আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const updateProfileById = async (req, res, next) => {
  try {
    const result = await profilesService.updateProfile(req.params.userId, req.body);
    res.json({ success: true, data: result, message: 'প্রোফাইল আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) throw { statusCode: 400, message: 'ছবি দেওয়া হয়নি' };
    const userId = req.params.userId || req.user.id;
    const result = await profilesService.uploadPhoto(userId, req.file);
    res.json({ success: true, data: result, message: 'ছবি আপলোড হয়েছে' });
  } catch (err) { next(err); }
};

const uploadNid = async (req, res, next) => {
  try {
    if (!req.file) throw { statusCode: 400, message: 'NID ছবি দেওয়া হয়নি' };
    const userId = req.params.userId || req.user.id;
    const result = await profilesService.uploadNid(userId, req.file);
    res.json({ success: true, data: result, message: 'NID আপলোড হয়েছে' });
  } catch (err) { next(err); }
};

const uploadSignature = async (req, res, next) => {
  try {
    if (!req.file) throw { statusCode: 400, message: 'সাইন আপলোড দেওয়া হয়নি' };
    const userId = req.params.userId || req.user.id;
    const result = await profilesService.uploadSignature(userId, req.file);
    res.json({ success: true, data: result, message: 'সাইন আপলোড হয়েছে' });
  } catch (err) { next(err); }
};

module.exports = { getMyProfile, getProfileById, updateMyProfile, updateProfileById, uploadPhoto, uploadNid, uploadSignature };
