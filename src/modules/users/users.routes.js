const express = require('express');
const router = express.Router();
const controller = require('./users.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');

router.use(authenticate);

router.get('/roles',         controller.getRoles);
router.post('/roles',        authorize('super_admin', 'advisor'), controller.createRole);
router.patch('/roles/:id',   authorize('super_admin', 'advisor'), controller.updateRole);
router.delete('/roles/:id',  authorize('super_admin', 'advisor'), controller.deleteRole);

router.get('/',              controller.getUsers);
router.get('/:id',           controller.getUserById);
router.post('/',             authorize('super_admin', 'advisor'), controller.createUser);
router.patch('/:id',         authorize('super_admin', 'advisor'), controller.updateUser);
router.patch('/:id/toggle',  authorize('super_admin', 'advisor'), controller.toggleActive);
router.delete('/:id',        authorize('super_admin'), controller.deleteUser);

module.exports = router;