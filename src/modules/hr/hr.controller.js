const hrService = require('./hr.service');

const getEmployees = async (req, res, next) => {
  try {
    const result = await hrService.getEmployees();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getEmployeeById = async (req, res, next) => {
  try {
    const result = await hrService.getEmployeeById(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getUnlinkedCrmUsers = async (req, res, next) => {
  try {
    const result = await hrService.getUnlinkedCrmUsers();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createEmployee = async (req, res, next) => {
  try {
    const result = await hrService.createEmployee(req.body, req.user.id);
    res.status(201).json({ success: true, data: result, message: 'কর্মী যুক্ত হয়েছে' });
  } catch (err) { next(err); }
};

const updateEmployee = async (req, res, next) => {
  try {
    const result = await hrService.updateEmployee(req.params.id, { ...req.body, __fromHR: true });
    res.json({ success: true, data: result, message: 'তথ্য আপডেট হয়েছে' });
  } catch (err) { next(err); }
};

const deleteEmployee = async (req, res, next) => {
  try {
    await hrService.deleteEmployee(req.params.id);
    res.json({ success: true, message: 'কর্মী নিষ্ক্রিয় করা হয়েছে' });
  } catch (err) { next(err); }
};

const getPositions = async (req, res, next) => {
  try {
    const result = await hrService.getPositions();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createPosition = async (req, res, next) => {
  try {
    const result = await hrService.createPosition(req.body);
    res.status(201).json({ success: true, data: result, message: 'Position created' });
  } catch (err) { next(err); }
};

const updatePosition = async (req, res, next) => {
  try {
    const result = await hrService.updatePosition(req.params.id, req.body);
    res.json({ success: true, data: result, message: 'Position updated' });
  } catch (err) { next(err); }
};

const deletePosition = async (req, res, next) => {
  try {
    await hrService.deletePosition(req.params.id);
    res.json({ success: true, message: 'Position deleted' });
  } catch (err) { next(err); }
};

const getOrganogram = async (req, res, next) => {
  try {
    const result = await hrService.getOrganogram();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getNotices = async (req, res, next) => {
  try {
    const result = await hrService.getNotices();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createNotice = async (req, res, next) => {
  try {
    const attachment_url = req.file ? req.file.path : (req.body.attachment_url || null);
    const result = await hrService.createNotice({ ...req.body, attachment_url }, req.user.id);
    res.status(201).json({ success: true, data: result, message: 'Notice posted' });
  } catch (err) { next(err); }
};

const deleteNotice = async (req, res, next) => {
  try {
    await hrService.deleteNotice(req.params.id);
    res.json({ success: true, message: 'Notice deleted' });
  } catch (err) { next(err); }
};

const uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await hrService.updateEmployee(req.params.id, {
      photo_url: req.file.path, photo_public_id: req.file.filename, __fromHR: true
    });
    res.json({ success: true, data: result, message: 'ছবি আপলোড হয়েছে' });
  } catch (err) { next(err); }
};

const uploadNid = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await hrService.updateEmployee(req.params.id, {
      nid_image_url: req.file.path, nid_image_public_id: req.file.filename, __fromHR: true
    });
    res.json({ success: true, data: result, message: 'NID আপলোড হয়েছে' });
  } catch (err) { next(err); }
};

const uploadSignature = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await hrService.updateEmployee(req.params.id, {
      signature_url: req.file.path, signature_public_id: req.file.filename, __fromHR: true
    });
    res.json({ success: true, data: result, message: 'স্বাক্ষর আপলোড হয়েছে' });
  } catch (err) { next(err); }
};

const getEmployeeModuleAccess = async (req, res, next) => {
  try {
    const result = await hrService.getEmployeeModuleAccess(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const setEmployeeModuleAccess = async (req, res, next) => {
  try {
    const result = await hrService.setEmployeeModuleAccess(req.params.id, req.body.access || []);
    res.json({ success: true, data: result, message: 'Access updated' });
  } catch (err) { next(err); }
};

const getHolidays = async (req, res, next) => {
  try {
    const result = await hrService.getHolidays(req.query.year);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const createHoliday = async (req, res, next) => {
  try {
    const result = await hrService.createHoliday(req.body);
    res.status(201).json({ success: true, data: result, message: 'ছুটি যুক্ত হয়েছে ✅' });
  } catch (err) { next(err); }
};

const deleteHoliday = async (req, res, next) => {
  try {
    await hrService.deleteHoliday(req.params.id);
    res.json({ success: true, message: 'মুছে ফেলা হয়েছে' });
  } catch (err) { next(err); }
};

const linkEssUser = async (req, res, next) => {
  try {
    const result = await hrService.linkEssUser(req.params.id, req.body.user_id);
    res.json({ success: true, data: result, message: 'ESS Access লিঙ্ক হয়েছে ✅' });
  } catch (err) { next(err); }
};

const unlinkEssUser = async (req, res, next) => {
  try {
    const result = await hrService.unlinkEssUser(req.params.id);
    res.json({ success: true, data: result, message: 'ESS Access সরানো হয়েছে' });
  } catch (err) { next(err); }
};

const createEssLogin = async (req, res, next) => {
  try {
    const result = await hrService.createEssLogin(req.params.id, req.user.id);
    res.status(201).json({ success: true, data: result, message: 'ESS Login তৈরি হয়েছে ✅' });
  } catch (err) { next(err); }
};

const syncProfiles = async (req, res, next) => {
  try {
    const result = await hrService.syncAllProfilesFromStaffProfiles();
    res.json({ success: true, data: result, message: `${result.synced} জন কর্মীর তথ্য sync হয়েছে` });
  } catch (err) { next(err); }
};

module.exports = {
  getEmployees, getEmployeeById, getUnlinkedCrmUsers, createEmployee, updateEmployee, deleteEmployee, syncProfiles,
  uploadPhoto, uploadNid, uploadSignature,
  getEmployeeModuleAccess, setEmployeeModuleAccess,
  getPositions, createPosition, updatePosition, deletePosition,
  getOrganogram, getHolidays, createHoliday, deleteHoliday, getNotices, createNotice, deleteNotice,
  linkEssUser, unlinkEssUser, createEssLogin,
};