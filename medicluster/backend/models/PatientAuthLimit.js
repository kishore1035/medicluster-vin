const { defineModel, schema: defineSchema } = require('../db/model');
const schema = defineSchema({
  _id: String, requests: [Date], accepted: Boolean, expiresAt: Date,
});
module.exports = defineModel('PatientAuthLimit', schema);
