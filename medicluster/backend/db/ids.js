const { randomBytes } = require('node:crypto');

function createId() { return randomBytes(12).toString('hex'); }
function isValidId(value) { return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value); }

module.exports = { createId, isValidId };
