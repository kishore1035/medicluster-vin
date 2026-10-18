const { defineModel, schema: defineSchema } = require('../db/model');

const HospitalSchema = defineSchema(
  {
    hospitalId:     { type: String, required: true, unique: true },
    name:           { type: String, required: true },
    trauma_level:   { type: Number, min: 1, max: 5, required: true },
    specialty:      { type: [String], default: [] },
    available_beds: { type: Number, default: 0 },
    location: {
      lat:         { type: Number, required: true },
      lng:         { type: Number, required: true },
      description: { type: String, default: "" },
    },
    phone:          { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = defineModel("Hospital", HospitalSchema);
