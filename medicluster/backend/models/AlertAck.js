/**
 * backend/models/AlertAck.js
 * Records that a clinician has read/acknowledged a derived alert.
 */

const { defineModel, schema: defineSchema } = require('../db/model');

const AlertAckSchema = defineSchema(
  {
    userId:  { type: String, ref: "User", required: true },
    alertId: { type: String, required: true },
  },
  { timestamps: true }
);


module.exports = defineModel("AlertAck", AlertAckSchema);
