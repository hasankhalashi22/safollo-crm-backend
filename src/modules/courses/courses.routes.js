const express = require('express');
const router = express.Router();
const controller = require('./courses.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');

router.use(authenticate);

router.get('/',                    controller.getCourses);
router.get('/:id',                 controller.getCourseById);
router.post('/',                   authorize('super_admin', 'advisor'), controller.createCourse);
router.patch('/:id',               authorize('super_admin', 'advisor'), controller.updateCourse);
router.delete('/:id',              authorize('super_admin', 'advisor'), controller.deleteCourse);
router.post('/batches',            authorize('super_admin', 'advisor'), controller.createBatch);
router.patch('/batches/:batchId',  authorize('super_admin', 'advisor'), controller.updateBatch);
router.delete('/batches/:batchId', authorize('super_admin', 'advisor'), controller.deleteBatch);

module.exports = router;