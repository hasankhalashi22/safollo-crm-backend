const express = require('express');
const router = express.Router();
const deviceController = require('./device.controller');

// ZKTeco ADMS pushes ATTLOG as raw text (often no/odd Content-Type), so this router parses the
// body as text regardless of Content-Type — the global express.json()/urlencoded() in app.js
// won't have captured it. No `authenticate` here: the device can't send a Bearer token; the
// SN allow-list check inside device.controller.js is the access control for this router.
router.use(express.text({ type: () => true, limit: '2mb' }));

router.get('/cdata', deviceController.handshake);
router.post('/cdata', deviceController.pushAttlog);
router.get('/getrequest', deviceController.getRequest);
router.post('/devicecmd', deviceController.deviceCmd);

module.exports = router;
