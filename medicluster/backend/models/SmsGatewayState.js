const { defineModel, schema: defineSchema } = require('../db/model');

module.exports = defineModel('SmsGatewayState', defineSchema({
  _id: { type: String, default: 'phone' },
  keyFingerprint: { type: String, required: true },
  lastSeenAt: { type: Date, required: true },
}));
