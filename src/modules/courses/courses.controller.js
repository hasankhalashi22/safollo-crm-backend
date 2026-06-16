// courses.controller.js
const coursesService = require('./courses.service');

const getCourses = async (req, res, next) => {
  try {
    const includeInactive = req.query.all === 'true' && req.user.role_level <= 2;
    const result = await coursesService.getCourses(includeInactive);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getCourseById = async (req, res, next) => {
  try {
    const result = await coursesService.getCourseById(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createCourse = async (req, res, next) => {
  try {
   const result = await coursesService.createCourse(req.body, req.user.id);
    res.status(201).json({ success: true, data: result, message: 'কোর্স তৈরি হয়েছে' });
  } catch (err) { next(err); }
};

const updateCourse = async (req, res, next) => {
  try {
    const result = await coursesService.updateCourse(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'কোর্স আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const createBatch = async (req, res, next) => {
  try {
    const result = await coursesService.createBatch(req.body, req.user.id);
    res.status(201).json({ success: true, data: result, message: 'ব্যাচ তৈরি হয়েছে' });
  } catch (err) { next(err); }
};

const updateBatch = async (req, res, next) => {
  try {
    const result = await coursesService.updateBatch(req.params.batchId, req.body);
    res.json({ success: true, data: result, message: 'ব্যাচ আপডেট হয়েছে' });
  } catch (err) { next(err); }
};
const deleteCourse = async (req, res, next) => {
  try {
    const result = await coursesService.deleteCourse(req.params.id);
    res.json({ success: true, data: result, message: 'কোর্স delete হয়েছে' });
  } catch (err) { next(err); }
};

const deleteBatch = async (req, res, next) => {
  try {
    const result = await coursesService.deleteBatch(req.params.batchId);
    res.json({ success: true, data: result, message: 'ব্যাচ delete হয়েছে' });
  } catch (err) { next(err); }
};

module.exports = { getCourses, getCourseById, createCourse, updateCourse, createBatch, updateBatch, deleteCourse, deleteBatch };
