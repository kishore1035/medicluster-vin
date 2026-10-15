/**
 * backend/models/User.js
 * Clinician account: credentials plus the role/department chosen during onboarding.
 */

const mongoose = require("mongoose");

const ROLES = ["physician", "nurse", "analyst", "dispatcher"];

const UserSchema = new mongoose.Schema(
  {
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:         { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role:         { type: String, enum: [...ROLES, null], default: null },
    department:   { type: String, default: "" },
    onboardedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

UserSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    role: this.role,
    department: this.department,
    onboarded: Boolean(this.onboardedAt),
  };
};

module.exports = mongoose.model("User", UserSchema);
module.exports.ROLES = ROLES;
