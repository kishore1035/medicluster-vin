/**
 * backend/models/AlertAck.js
 * Records that a clinician has read/acknowledged a derived alert.
 */

const mongoose = require("mongoose");

const AlertAckSchema = new mongoose.Schema(
  {
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    alertId: { type: String, required: true },
  },
  { timestamps: true }
);

AlertAckSchema.index({ userId: 1, alertId: 1 }, { unique: true });

module.exports = mongoose.model("AlertAck", AlertAckSchema);
