const deviceService = require('./device.service');

// ADMS/Push SDK handlers for ZKTeco devices. These endpoints have no bearer-token auth available
// to the device firmware, so every handler gates on the SN (serial number) allow-list instead —
// an unregistered/inactive device gets a silent "OK" with zero processing, never a real config
// or an error that would reveal the endpoint's shape.

const handshake = async (req, res, next) => {
  try {
    const sn = req.query.SN;
    const device = await deviceService.getActiveDeviceBySerial(sn);
    if (!device) return res.type('text/plain').send('OK');

    await deviceService.touchDevice(sn, req.ip);
    res.type('text/plain').send(
      `GET OPTION FROM: ${sn}\r\n` +
      `Stamp=9999\r\n` +
      `OpStamp=9999\r\n` +
      `ErrorDelay=30\r\n` +
      `Delay=30\r\n` +
      `TransTimes=00:00;12:00\r\n` +
      `TransInterval=1\r\n` +
      `TransFlag=TransData AttLog\tOperLog\tAttPhoto\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFPImag\r\n` +
      `Realtime=1\r\n` +
      `Encrypt=None\r\n`
    );
  } catch (err) { next(err); }
};

const pushAttlog = async (req, res, next) => {
  try {
    const sn = req.query.SN;
    const device = await deviceService.getActiveDeviceBySerial(sn);
    if (!device) return res.type('text/plain').send('OK');

    await deviceService.touchDevice(sn, req.ip);
    const count = await deviceService.processAttlogBatch(sn, req.body);
    res.type('text/plain').send(`OK: ${count}`);
  } catch (err) { next(err); }
};

const getRequest = async (req, res, next) => {
  try {
    const sn = req.query.SN;
    const device = await deviceService.getActiveDeviceBySerial(sn);
    if (device) await deviceService.touchDevice(sn, req.ip);
    res.type('text/plain').send('OK'); // no pending commands (enrollment/reboot not needed)
  } catch (err) { next(err); }
};

const deviceCmd = async (req, res) => {
  res.type('text/plain').send('OK'); // accept & ignore command-execution results
};

module.exports = { handshake, pushAttlog, getRequest, deviceCmd };
