const { defineModel, schema: defineSchema } = require('../db/model');
const schema = defineSchema({
  email: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  usedAt: { type: Date, default: null },
}, { timestamps: true });
module.exports = defineModel('PatientEmailOtp', schema);
