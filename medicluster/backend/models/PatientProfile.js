/**
 * backend/models/PatientProfile.js
 * Patient-app profile: display name, care team, next visit and emergency contact.
 */

const { defineModel, schema: defineSchema } = require('../db/model');

const PatientProfileSchema = defineSchema(
  {
    patientId: { type: String, required: true, unique: true },
    name:      { type: String, default: "" },
    // Mobile number (10 digits, no country code) the clinic linked for patient-app sign-in.
    mobile:    { type: String, default: undefined, index: { unique: true, sparse: true } },
    email:     { type: String, lowercase: true, trim: true, default: undefined, index: { unique: true, sparse: true } },
    googleSubject: { type: String, default: undefined, select: false, index: { unique: true, sparse: true } },
    nextVisit: {
      at:       { type: Date, default: null },
      doctor:   { type: String, default: "" },
      department: { type: String, default: "" },
      location: { type: String, default: "" },
      checklist: {
        type: [{ label: String, done: { type: Boolean, default: false }, _id: false }],
        default: [],
      },
    },
    emergencyContact: {
      name:     { type: String, default: "" },
      relation: { type: String, default: "" },
      phone:    { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = defineModel("PatientProfile", PatientProfileSchema);
