const mongoose = require('mongoose');

module.exports = mongoose.model('SmsGatewayState', new mongoose.Schema({
  _id: { type: String, default: 'phone' },
  keyFingerprint: { type: String, required: true },
  lastSeenAt: { type: Date, required: true },
}));
