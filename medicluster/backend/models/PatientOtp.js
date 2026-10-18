/**
 * backend/models/PatientOtp.js
 * One-time sign-in codes for the patient mobile app. Only a hash of the code is stored.
 */

const { defineModel, schema: defineSchema } = require('../db/model');

const PatientOtpSchema = defineSchema(
  {
    mobile:    { type: String, required: true, index: true },
    codeHash:  { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts:  { type: Number, default: 0 },
    usedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

// Expiration is checked by the atomic sign-in queries.

module.exports = defineModel("PatientOtp", PatientOtpSchema);
