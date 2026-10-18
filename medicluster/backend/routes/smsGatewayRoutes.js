const express = require('express');
const crypto = require('node:crypto');
const SmsJob = require('../models/SmsJob');
const SmsGatewayState = require('../models/SmsGatewayState');
const PatientOtp = require('../models/PatientOtp');
const { gatewayKey, keyFingerprint, decryptPayload } = require('../services/otpDelivery');

const router = express.Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use((req, res, next) => {
  if (process.env.OTP_DELIVERY_MODE !== 'android') return res.status(503).json({ error: 'SMS gateway is disabled' });
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Invalid sender key' });
    const token = header.slice(7);
    const presented = crypto.createHash('sha256').update(token).digest();
    if (!crypto.timingSafeEqual(presented, gatewayKey())) return res.status(401).json({ error: 'Invalid sender key' });
    return next();
  } catch {
    return res.status(503).json({ error: 'SMS gateway is not configured' });
  }
});

async function touchGateway() {
  await SmsGatewayState.findOneAndUpdate({ _id: 'phone' }, {
    keyFingerprint: keyFingerprint(), lastSeenAt: new Date(),
  }, { upsert: true });
}

router.post('/heartbeat', async (_req, res, next) => {
  try {
    await touchGateway();
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

// Claim is also a heartbeat. Claims are never requeued: an uncertain send must not duplicate an SMS.
router.post('/claim', async (_req, res, next) => {
  try {
    const fingerprint = keyFingerprint();
    await touchGateway();
    for (let attempts = 0; attempts < 10; attempts += 1) {
      const job = await SmsJob.findOneAndUpdate({
        status: 'queued', expiresAt: { $gt: new Date(Date.now() + 10_000) }, keyFingerprint: fingerprint,
      }, {
        $set: { status: 'claimed', claimedAt: new Date() }, $unset: { encryptedPayload: 1 },
      }, { sort: { createdAt: 1 }, new: false }).select('+encryptedPayload').lean();
      if (!job) return res.json({ job: null });
      const validOtp = await PatientOtp.exists({ _id: job.otpId, usedAt: null, expiresAt: { $gt: new Date() } });
      if (!validOtp) {
        await SmsJob.updateOne({ _id: job._id }, { status: 'failed', completedAt: new Date() });
        continue;
      }
      let payload;
      try { payload = decryptPayload(job.encryptedPayload); } catch {
        await SmsJob.updateOne({ _id: job._id }, { status: 'failed', completedAt: new Date() });
        continue;
      }
      return res.json({ job: { id: String(job._id), ...payload, expiresAt: job.expiresAt } });
    }
    return res.json({ job: null });
  } catch (error) { return next(error); }
});

router.post('/jobs/:id/result', async (req, res, next) => {
  try {
    const { status, errorCode } = req.body;
    if (!/^[a-f\d]{24}$/i.test(req.params.id) || !['sent', 'failed'].includes(status)
      || (errorCode !== undefined && !Number.isInteger(errorCode))) {
      return res.status(400).json({ error: 'Invalid SMS result' });
    }
    const fingerprint = keyFingerprint();
    const job = await SmsJob.findOneAndUpdate({ _id: req.params.id, status: 'claimed', keyFingerprint: fingerprint }, {
      $set: { status, ...(errorCode !== undefined ? { errorCode } : {}), completedAt: new Date() },
    }, { new: true }).lean();
    if (!job) {
      const completed = await SmsJob.exists({ _id: req.params.id, status, keyFingerprint: fingerprint });
      if (!completed) return res.status(409).json({ error: 'Job is not awaiting this result' });
    }
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

module.exports = router;
