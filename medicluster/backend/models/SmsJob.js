const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  otpId: { type: mongoose.Schema.Types.ObjectId, required: true },
  encryptedPayload: { type: String, select: false },
  keyFingerprint: { type: String, required: true },
  status: { type: String, enum: ['queued', 'claimed', 'sent', 'failed'], default: 'queued' },
  expiresAt: { type: Date, required: true },
  claimedAt: Date,
  completedAt: Date,
  errorCode: Number,
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ status: 1, createdAt: 1 });
module.exports = mongoose.model('SmsJob', schema);
