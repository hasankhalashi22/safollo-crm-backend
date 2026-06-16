const express = require('express');
const router = express.Router();
const controller = require('./profiles.controller');
const { authenticate, authorize, authorizeLevel } = require('../../middleware/authenticate');
const { validate, updateProfileSchema } = require('../../utils/validators');
const { uploadProfile, uploadNid, uploadSignature } = require('../../config/cloudinary');

router.use(authenticate);

// Own profile
router.get('/me',                 controller.getMyProfile);
router.patch('/me',               validate(updateProfileSchema), controller.updateMyProfile);
router.post('/me/photo',          uploadProfile.single('photo'), controller.uploadPhoto);
router.post('/me/nid',            uploadNid.single('nid'), controller.uploadNid);
router.post('/me/signature',      uploadSignature.single('signature'), controller.uploadSignature);

// Admin: any user's profile
router.get('/:userId',            authorizeLevel(2), controller.getProfileById);
router.patch('/:userId',          authorize('super_admin'), controller.updateProfileById);
router.post('/:userId/photo',     authorize('super_admin'), uploadProfile.single('photo'), controller.uploadPhoto);
router.post('/:userId/nid',       authorize('super_admin'), uploadNid.single('nid'), controller.uploadNid);
router.post('/:userId/signature', authorize('super_admin'), uploadSignature.single('signature'), controller.uploadSignature);

module.exports = router;
