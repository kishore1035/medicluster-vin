const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const PatientProfile = require('../models/PatientProfile');
const PatientEmailOtp = require('../models/PatientEmailOtp');
const PatientGoogleFlow = require('../models/PatientGoogleFlow');
const PatientLoginExchange = require('../models/PatientLoginExchange');
const { signPatientToken } = require('../middleware/auth');
const { emailEnabled, sendEmailCode } = require('../services/emailOtpDelivery');
const { smsEnabled } = require('../services/otpDelivery');
const { digest, challenge, random, normalizeEmail, validEmail, authError, reserveEmailRequest,
  publicOrigin, googleClient, googleEnabled, googlePatient } = require('../services/patientIdentity');

const router = express.Router();
const COOKIE = 'mc_patient_google';
const cookieOptions = () => ({ httpOnly: true, secure: publicOrigin().startsWith('https:'), sameSite: 'lax', path: '/api/patient-auth/google', maxAge: 10 * 60_000 });
const session = profile => ({ token: signPatientToken(profile.patientId), patientId: profile.patientId, name: profile.name });
const fail = (error, res, next) => error.patientAuthError ? res.status(error.status).json({ error: error.message }) : next(error);
router.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });

router.get('/config', (_req, res) => res.json({ email: emailEnabled(), google: googleEnabled(), sms: smsEnabled() }));

router.post('/request-email-code', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (!emailEnabled()) throw authError('Email sign-in is not configured. Ask your clinic for help.');
    await reserveEmailRequest(email);
    const profile = await PatientProfile.findOne({ email }).lean();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = await PatientEmailOtp.create({ email, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 5 * 60_000) });
    try { if (profile) await sendEmailCode(email, profile.name, code, otp.expiresAt); } catch (error) {
      await PatientEmailOtp.deleteOne({ _id: otp._id });
      throw error;
    }
    return res.json({ sent: true, resendAfterSeconds: 30 });
  } catch (error) { return fail(error, res, next); }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '');
    if (!validEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter your email and 6-digit code' });
    const otp = await PatientEmailOtp.findOne({ email, usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!otp) return res.status(401).json({ error: 'That code has expired. Request a new one.' });
    if (otp.attempts >= 5) return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
    if (!await bcrypt.compare(code, otp.codeHash)) {
      await PatientEmailOtp.updateOne({ _id: otp._id, usedAt: null }, { $inc: { attempts: 1 } });
      return res.status(401).json({ error: "That code isn't right" });
    }
    const consumed = await PatientEmailOtp.findOneAndUpdate({ _id: otp._id, usedAt: null, attempts: { $lt: 5 }, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
    if (!consumed) return res.status(401).json({ error: 'That code has expired. Request a new one.' });
    const profile = await PatientProfile.findOne({ email }).lean();
    if (!profile) return res.status(401).json({ error: 'No patient record is linked to this email. Ask your clinic for help.' });
    return res.json(session(profile));
  } catch (error) { return fail(error, res, next); }
});

router.get('/google/start', async (req, res, next) => {
  try {
    const client = googleClient();
    const handoffChallenge = req.query.handoff_challenge;
    const platform = req.query.platform;
    if (typeof handoffChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(handoffChallenge) || !['web', 'android'].includes(platform)) {
      return res.status(400).json({ error: 'Start Google sign-in from the patient app' });
    }
    const state = random();
    const browser = random();
    const providerVerifier = random();
    const nonce = random();
    await PatientGoogleFlow.create({ _id: digest(state), browserHash: digest(browser), providerVerifier, nonce,
      handoffChallenge, platform, expiresAt: new Date(Date.now() + 10 * 60_000) });
    res.cookie(COOKIE, browser, cookieOptions());
    return res.redirect(client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], response_type: 'code',
      state, nonce, code_challenge: challenge(providerVerifier), code_challenge_method: 'S256', prompt: 'select_account' }));
  } catch (error) { return fail(error, res, next); }
});

function returnToPatient(res, flow, result) {
  const destination = new URL(flow?.platform === 'android' ? 'mediclusterpatient://google-return' : `${publicOrigin()}/app`);
  if (result.code) destination.searchParams.set(flow?.platform === 'android' ? 'code' : 'patient_auth_code', result.code);
  else destination.searchParams.set(flow?.platform === 'android' ? 'error' : 'auth_error', result.error);
  return res.redirect(destination.toString());
}

router.get('/google/callback', async (req, res) => {
  let flow;
  try {
    const client = googleClient();
    const state = req.query.state;
    const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || !cookie || !/^[a-f0-9]{64}$/.test(cookie)) {
      return returnToPatient(res, null, { error: 'google_failed' });
    }
    flow = await PatientGoogleFlow.findOneAndDelete({ _id: digest(state), browserHash: digest(cookie), expiresAt: { $gt: new Date() } }).lean();
    res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
    if (!flow) return returnToPatient(res, null, { error: 'google_failed' });
    if (req.query.error) return returnToPatient(res, flow, { error: 'google_cancelled' });
    if (typeof req.query.code !== 'string' || !req.query.code) return returnToPatient(res, flow, { error: 'google_failed' });
    const { tokens } = await client.getToken({ code: req.query.code, codeVerifier: flow.providerVerifier });
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || payload.nonce !== flow.nonce) return returnToPatient(res, flow, { error: 'google_failed' });
    const profile = await googlePatient(payload);
    const code = random();
    await PatientLoginExchange.create({ _id: digest(code), challenge: flow.handoffChallenge, patientId: profile.patientId, expiresAt: new Date(Date.now() + 60_000) });
    return returnToPatient(res, flow, { code });
  } catch (error) {
    const allowed = ['google_email_unverified', 'google_email_not_authoritative', 'google_identity_conflict', 'patient_not_linked'];
    try { return returnToPatient(res, flow, { error: allowed.includes(error.reason) ? error.reason : 'google_failed' }); }
    catch { return res.status(503).json({ error: 'Google sign-in is not configured. Ask your clinic for help.' }); }
  }
});

router.post('/google/exchange', async (req, res, next) => {
  try {
    const { code, verifier } = req.body;
    if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code) || typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      return res.status(401).json({ error: 'Google sign-in expired. Try again.' });
    }
    const exchange = await PatientLoginExchange.findOneAndDelete({ _id: digest(code), challenge: challenge(verifier), expiresAt: { $gt: new Date() } }).lean();
    if (!exchange) return res.status(401).json({ error: 'Google sign-in expired. Try again.' });
    const profile = await PatientProfile.findOne({ patientId: exchange.patientId }).lean();
    if (!profile) return res.status(401).json({ error: 'Patient account is no longer available' });
    return res.json(session(profile));
  } catch (error) { return fail(error, res, next); }
});

module.exports = router;
