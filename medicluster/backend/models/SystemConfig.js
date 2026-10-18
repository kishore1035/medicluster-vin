const { defineModel, schema: defineSchema } = require('../db/model');

const SystemConfigSchema = defineSchema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
}, { timestamps: true });

module.exports = defineModel("SystemConfig", SystemConfigSchema);
