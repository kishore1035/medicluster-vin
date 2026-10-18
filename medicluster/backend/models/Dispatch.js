const { defineModel, schema: defineSchema } = require('../db/model');

const DispatchSchema = defineSchema(
  {
    dispatch_id:    { type: String, required: true, unique: true },
    emergency: {
      caller_location:    { type: String, required: true },
      reported_condition: { type: String, required: true },
      severity_score:     { type: Number, min: 1, max: 10, required: true },
      casualties:         { type: Number, default: 1 },
    },
    aria_response:  { type: Object, default: null },
    status:         { type: String, enum: ["active", "resolved", "cancelled"], default: "active" },
    dispatched_ambulance_id: { type: String, default: null },
    primary_hospital_id:     { type: String, default: null },
  },
  { timestamps: true }
);


module.exports = defineModel("Dispatch", DispatchSchema);
