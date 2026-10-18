/**
 * backend/routes/patientAuthRoutes.js
 * Patient mobile-app sign-in: a one-time code sent to the mobile number the clinic linked.
 */

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const PatientOtp = require("../models/PatientOtp");
const PatientProfile = require("../models/PatientProfile");
const { signPatientToken } = require("../middleware/auth");
const { deliverCode } = require("../services/otpDelivery");

const router = express.Router();

const CODE_TTL_MS = 5 * 60_000;
const RESEND_AFTER_MS = 30_000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

// "+91 98450 12345" / "919845012345" / "9845012345" → "9845012345"
function normalizeMobile(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

// ── POST /api/patient-auth/request-code  { mobile } ─────────────────────────
router.post("/request-code", async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body.mobile);
    if (!mobile) return res.status(400).json({ error: "Enter a 10-digit Indian mobile number" });

    const since = new Date(Date.now() - 60 * 60_000);
    const recent = await PatientOtp.find({ mobile, createdAt: { $gte: since } }).sort({ createdAt: -1 }).lean();
    if (recent[0] && Date.now() - recent[0].createdAt < RESEND_AFTER_MS) {
      return res.status(429).json({ error: "Please wait 30 seconds before requesting another code" });
    }
    if (recent.length >= MAX_CODES_PER_HOUR) {
      return res.status(429).json({ error: "Too many codes requested. Try again in an hour." });
    }

    // Same reply and rate limits whether or not the number is linked, so numbers can't be probed.
    // Unlinked numbers get a record too, but no code is sent and verify finds no patient.
    const linked = await PatientProfile.exists({ mobile });
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const otp = await PatientOtp.create({ mobile, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
    try {
      if (linked) await deliverCode(mobile, code, otp);
    } catch (error) {
      await PatientOtp.deleteOne({ _id: otp._id });
      throw error;
    }
    return res.json({ sent: true, resendAfterSeconds: RESEND_AFTER_MS / 1000 });
  } catch (err) {
    if (err.code === 'OTP_DELIVERY_UNAVAILABLE') return res.status(503).json({ error: err.message });
    return next(err);
  }
});

// ── POST /api/patient-auth/verify  { mobile, code } ─────────────────────────
router.post("/verify", async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body.mobile);
    const code = String(req.body.code || "");
    if (!mobile || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit code" });

    const otp = await PatientOtp.findOne({ mobile, usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!otp) return res.status(401).json({ error: "That code has expired. Request a new one." });
    if (otp.attempts >= MAX_ATTEMPTS) return res.status(429).json({ error: "Too many wrong attempts. Request a new code." });

    if (!(await bcrypt.compare(code, otp.codeHash))) {
      await PatientOtp.updateOne({ _id: otp._id, usedAt: null }, { $inc: { attempts: 1 } });
      return res.status(401).json({ error: "That code isn't right" });
    }
    const consumed = await PatientOtp.findOneAndUpdate({
      _id: otp._id, usedAt: null, attempts: { $lt: MAX_ATTEMPTS }, expiresAt: { $gt: new Date() },
    }, { $set: { usedAt: new Date() } });
    if (!consumed) return res.status(401).json({ error: "That code has expired. Request a new one." });

    const profile = await PatientProfile.findOne({ mobile }).lean();
    if (!profile) return res.status(404).json({ error: "No patient record is linked to this number" });
    return res.json({ token: signPatientToken(profile.patientId), patientId: profile.patientId, name: profile.name });
  } catch (err) {
    return next(err);
  }
});

router.use(require('./patientIdentityRoutes'));

module.exports = router;
module.exports.normalizeMobile = normalizeMobile;
