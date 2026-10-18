const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String, requests: [Date], accepted: Boolean, expiresAt: Date,
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('PatientAuthLimit', schema);
