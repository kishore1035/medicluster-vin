/**
 * backend/routes/patientAppRoutes.js
 * Patient mobile app: profile (visit, emergency contact) and self-logged readings.
 */

const express = require("express");
const PatientProfile = require("../models/PatientProfile");
const Reading = require("../models/Reading");

const router = express.Router();

// ── GET /api/patient-app/:patientId/profile ───────────────────────────────
router.get("/:patientId/profile", async (req, res, next) => {
  try {
    const profile = await PatientProfile.findOne({ patientId: req.params.patientId }).lean();
    return res.json(profile ?? { patientId: req.params.patientId });
  } catch (err) {
    return next(err);
  }
});

// ── PUT /api/patient-app/:patientId/profile ───────────────────────────────
router.put("/:patientId/profile", async (req, res, next) => {
  const { name, nextVisit, emergencyContact } = req.body;
  const update = {};
  if (typeof name === "string") update.name = name.trim();
  if (nextVisit && typeof nextVisit === "object") update.nextVisit = nextVisit;
  if (emergencyContact && typeof emergencyContact === "object") update.emergencyContact = emergencyContact;
  try {
    const profile = await PatientProfile.findOneAndUpdate(
      { patientId: req.params.patientId },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    return res.json(profile);
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/patient-app/:patientId/readings ──────────────────────────────
router.get("/:patientId/readings", async (req, res, next) => {
  try {
    const readings = await Reading.find({ patientId: req.params.patientId })
      .sort({ takenAt: -1 })
      .limit(90)
      .lean();
    return res.json(readings);
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/patient-app/:patientId/readings ─────────────────────────────
router.post("/:patientId/readings", async (req, res, next) => {
  const { type, value, diastolic, context } = req.body;
  if (!["glucose", "bp", "weight"].includes(type)) {
    return res.status(400).json({ error: "type must be glucose, bp or weight" });
  }
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: "value must be a positive number" });
  }
  if (type === "bp" && (!Number.isFinite(diastolic) || diastolic <= 0)) {
    return res.status(400).json({ error: "diastolic is required for bp" });
  }
  try {
    const reading = await Reading.create({
      patientId: req.params.patientId,
      type,
      value,
      diastolic: type === "bp" ? diastolic : null,
      context: type === "glucose" ? (context ?? "") : "",
    });
    return res.status(201).json(reading);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
