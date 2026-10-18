const { defineModel, schema: defineSchema } = require('../db/model');
const schema = defineSchema({ _id: String, challenge: String, patientId: String, expiresAt: Date });
module.exports = defineModel('PatientLoginExchange', schema);
