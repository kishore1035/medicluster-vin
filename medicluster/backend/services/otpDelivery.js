const crypto = require('node:crypto');
const SmsJob = require('../models/SmsJob');
const SmsGatewayState = require('../models/SmsGatewayState');

const ONLINE_WINDOW_MS = 30_000;

function smsEnabled() {
  const mode = process.env.OTP_DELIVERY_MODE || 'disabled';
  return (mode === 'android' && (process.env.SMS_GATEWAY_TOKEN || '').length >= 32)
    || (mode === 'disabled' && process.env.OTP_DEV_LOG === 'true' && process.env.NODE_ENV !== 'production');
}

function unavailable(message) {
  return Object.assign(new Error(message), { status: 503, code: 'OTP_DELIVERY_UNAVAILABLE' });
}

function gatewayKey() {
  const token = process.env.SMS_GATEWAY_TOKEN || '';
  if (token.length < 32) throw unavailable('SMS sender is not configured. Ask your clinic for help.');
  return crypto.createHash('sha256').update(token).digest();
}

function keyFingerprint() {
  return crypto.createHash('sha256').update(gatewayKey()).digest('hex');
}

function encryptPayload(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', gatewayKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decryptPayload(encoded) {
  const payload = Buffer.from(encoded, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', gatewayKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8'));
}

async function deliverCode(mobile, code, otp) {
  const mode = process.env.OTP_DELIVERY_MODE || 'disabled';
  if (mode === 'android') {
    const fingerprint = keyFingerprint();
    const online = await SmsGatewayState.exists({
      _id: 'phone', keyFingerprint: fingerprint,
      lastSeenAt: { $gt: new Date(Date.now() - ONLINE_WINDOW_MS) },
    });
    if (!online) throw unavailable('SMS sender is offline. Ask your clinic to start it, then try again.');
    await SmsJob.create({
      otpId: otp._id,
      keyFingerprint: fingerprint,
      encryptedPayload: encryptPayload({
        mobile: `+91${mobile}`,
        message: `Your MediCluster sign-in code is ${code}. Expires in 5 minutes. Do not share this code.`,
      }),
      expiresAt: otp.expiresAt,
    });
    return;
  }
  if (mode === 'disabled' && process.env.OTP_DEV_LOG === 'true' && process.env.NODE_ENV !== 'production') {
    console.log(`[patient-otp] code for ******${mobile.slice(-4)}: ${code}`);
    return;
  }
  throw unavailable('Text-message sign-in is not configured. Ask your clinic for help.');
}

module.exports = { deliverCode, gatewayKey, keyFingerprint, decryptPayload, smsEnabled };
