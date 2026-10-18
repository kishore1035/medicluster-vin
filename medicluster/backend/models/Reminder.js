/**
 * backend/models/Reminder.js
 * Medication reminder schedule for a patient.
 */

const { defineModel, schema: defineSchema } = require('../db/model');

const ReminderSchema = defineSchema(
  {
    patientId:      { type: String, required: true, index: true },
    medicationName: { type: String, required: true },
    dosage:         { type: String, default: "" },
    times:          { type: [String], default: [] },  // e.g. ["08:00", "14:00", "20:00"]
    frequency:      { type: String, default: "daily" }, // daily | weekly | as-needed
    days:           { type: [String], default: [] },    // for weekly: ["Mon","Wed","Fri"]
    notes:          { type: String, default: "" },
    active:         { type: Boolean, default: true },
    pillsLeft:      { type: Number, default: null },     // null = not tracked
    refillRequestedAt: { type: Date, default: null },
    // One entry per dose slot the patient confirmed: date "YYYY-MM-DD" + slot time "HH:MM"
    doseLog: {
      type: [{ date: String, time: String, takenAt: { type: Date, default: Date.now }, _id: false }],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = defineModel("Reminder", ReminderSchema);
