/**
 * backend/models/PatientOtp.js
 * One-time sign-in codes for the patient mobile app. Only a hash of the code is stored.
 */

const mongoose = require("mongoose");

const PatientOtpSchema = new mongoose.Schema(
  {
    mobile:    { type: String, required: true, index: true },
    codeHash:  { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts:  { type: Number, default: 0 },
    usedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

// Mongo removes codes once they expire.
PatientOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PatientOtp", PatientOtpSchema);
