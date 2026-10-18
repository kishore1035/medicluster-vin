const { defineModel, schema: defineSchema } = require('../db/model');
const schema = defineSchema({
  _id: String, browserHash: String, providerVerifier: String, nonce: String,
  handoffChallenge: String, platform: { type: String, enum: ['web', 'android'] }, expiresAt: Date,
});
module.exports = defineModel('PatientGoogleFlow', schema);
