/**
 * backend/models/Reading.js
 * Self-logged vital reading from the patient app.
 */

const mongoose = require("mongoose");

const ReadingSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, index: true },
    type:      { type: String, required: true, enum: ["glucose", "bp", "weight"] },
    value:     { type: Number, required: true },      // glucose mg/dL, systolic mmHg, or weight kg
    diastolic: { type: Number, default: null },       // bp only
    context:   { type: String, default: "" },         // glucose: fasting | after-meal | bedtime
    takenAt:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reading", ReadingSchema);
