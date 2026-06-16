// payments.service.js — re-exports from sales service
const { addDuePayment } = require('../sales/sales.service');
module.exports = { addDuePayment };
