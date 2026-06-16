const usersService = require('./users.service');
const auditService = require('../audit/audit.service');

const createUser = async (req, res, next) => {
  try {
    console.log('Create user request:', req.body);
    const result = await usersService.createUser(req.body, req.user.id);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'staff',
      targetId: result.data?.id,
      targetName: req.body.phone,
      description: `নতুন স্টাফ — ${req.body.phone}`,
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  } catch (err) { next(err); }
};

const getUsers = async (req, res, next) => {
  try {
    const result = await usersService.getUsers(req.query, req.user);
    res.json(result);
  } catch (err) { next(err); }
};

const getUserById = async (req, res, next) => {
  try {
    const result = await usersService.getUserById(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
};

const toggleActive = async (req, res, next) => {
  try {
    const result = await usersService.toggleActive(req.params.id, req.user.id);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'UPDATE',
      module: 'staff',
      targetId: req.params.id,
      description: `স্টাফ status toggle`,
      ipAddress: req.ip,
    });
    res.json(result);
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const result = await usersService.updateUser(req.params.id, req.body);
    res.json(result);
  } catch (err) { next(err); }
};

const getRoles = async (req, res, next) => {
  try {
    const result = await usersService.getRoles();
    res.json(result);
  } catch (err) { next(err); }
};

const createRole = async (req, res, next) => {
  try {
    const result = await usersService.createRole(req.body);
    res.status(201).json({ success: true, data: result, message: 'Role তৈরি হয়েছে' });
  } catch (err) { next(err); }
};

const updateRole = async (req, res, next) => {
  try {
    const result = await usersService.updateRole(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'Role আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const deleteRole = async (req, res, next) => {
  try {
    const result = await usersService.deleteRole(req.params.id);
    res.json({ success: true, data: result, message: 'Role মুছে ফেলা হয়েছে' });
  } catch (err) { next(err); }
};

const deleteUser = async (req, res, next) => {
  try {
    const result = await usersService.deleteUser(req.params.id);
    auditService.log({
      userId: req.user.id,
      userName: req.user.phone,
      userRole: req.user.role,
      action: 'DELETE',
      module: 'staff',
      targetId: req.params.id,
      description: `স্টাফ delete`,
      ipAddress: req.ip,
    });
    res.json({ success: true, data: result, message: 'স্টাফ delete হয়েছে' });
  } catch (err) { next(err); }
};

module.exports = { createUser, getUsers, getUserById, toggleActive, updateUser, getRoles, createRole, updateRole, deleteRole, deleteUser };