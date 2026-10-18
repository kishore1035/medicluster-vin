const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String, browserHash: String, providerVerifier: String, nonce: String,
  handoffChallenge: String, platform: { type: String, enum: ['web', 'android'] }, expiresAt: Date,
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('PatientGoogleFlow', schema);
