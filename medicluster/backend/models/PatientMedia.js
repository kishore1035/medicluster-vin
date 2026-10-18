const { defineModel, schema: defineSchema } = require('../db/model');

const FindingSchema = defineSchema(
  { label: String, confidence: Number },
  { _id: false }
);

const PatientMediaSchema = defineSchema(
  {
    patient_id: { type: String, required: true, index: true },
    original_name: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number },
    file_type: { type: String, enum: ["image", "document"], required: true },
    gridfs_id: { type: String, required: true },
    storageKey: { type: String },
    analysis: {
      findings: [FindingSchema],
      model: String,
      analyzedAt: Date,
    },
  },
  { timestamps: true }
);

module.exports = defineModel("PatientMedia", PatientMediaSchema);
