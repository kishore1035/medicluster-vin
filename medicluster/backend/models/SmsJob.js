const { defineModel, schema: defineSchema } = require('../db/model');

const schema = defineSchema({
  otpId: { type: String, required: true },
  encryptedPayload: { type: String, select: false },
  keyFingerprint: { type: String, required: true },
  status: { type: String, enum: ['queued', 'claimed', 'sent', 'failed'], default: 'queued' },
  expiresAt: { type: Date, required: true },
  claimedAt: Date,
  completedAt: Date,
  errorCode: Number,
}, { timestamps: true });
module.exports = defineModel('SmsJob', schema);
