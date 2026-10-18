const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const PatientProfile = require('../models/PatientProfile');
const PatientAuthLimit = require('../models/PatientAuthLimit');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const challenge = value => crypto.createHash('sha256').update(value).digest('base64url');
const random = () => crypto.randomBytes(32).toString('hex');
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const authError = (message, status = 503) => Object.assign(new Error(message), { status, patientAuthError: true });

async function reserveEmailRequest(email) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 60_000);
  const update = [
    { $set: { requests: { $filter: { input: { $ifNull: ['$requests', []] }, as: 'at', cond: { $gt: ['$$at', cutoff] } } } } },
    { $set: { accepted: { $and: [
      { $lt: [{ $size: '$requests' }, 5] },
      { $lte: [{ $ifNull: [{ $arrayElemAt: ['$requests', -1] }, new Date(0)] }, new Date(now.getTime() - 30_000)] },
    ] } } },
    { $set: { requests: { $cond: ['$accepted', { $concatArrays: ['$requests', [now]] }, '$requests'] }, expiresAt: new Date(now.getTime() + 60 * 60_000) } },
  ];
  let reservation;
  try {
    reservation = await PatientAuthLimit.findOneAndUpdate({ _id: `email:${digest(email)}` }, update, { upsert: true, new: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    reservation = await PatientAuthLimit.findOneAndUpdate({ _id: `email:${digest(email)}` }, update, { new: true });
  }
  if (!reservation?.accepted) throw authError('Please wait 30 seconds between codes. You can request up to 5 codes per hour.', 429);
}

function publicOrigin() {
  const value = process.env.PATIENT_PUBLIC_ORIGIN || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  let url;
  try { url = new URL(value); } catch { throw authError('Patient sign-in is not configured. Ask your clinic for help.'); }
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw authError('Patient sign-in is not configured. Ask your clinic for help.');
  }
  return url.origin;
}

function googleClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw authError('Google sign-in is not configured. Ask your clinic for help.');
  return new OAuth2Client({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${publicOrigin()}/api/patient-auth/google/callback` });
}

function googleEnabled() {
  try { googleClient(); return true; } catch { return false; }
}

async function googlePatient(payload) {
  if (!payload || typeof payload.sub !== 'string' || !payload.sub || payload.email_verified !== true || !validEmail(normalizeEmail(payload.email))) {
    throw Object.assign(new Error('Google email is not verified'), { reason: 'google_email_unverified' });
  }
  const existing = await PatientProfile.findOne({ googleSubject: payload.sub }).lean();
  if (existing) return existing;
  const email = normalizeEmail(payload.email);
  if (!email.endsWith('@gmail.com') && !(typeof payload.hd === 'string' && payload.hd.length > 0)) {
    throw Object.assign(new Error('Use email code for this address'), { reason: 'google_email_not_authoritative' });
  }
  try {
    const patient = await PatientProfile.findOneAndUpdate({ email,
      $or: [{ googleSubject: { $exists: false } }, { googleSubject: payload.sub }],
    }, { $set: { googleSubject: payload.sub } }, { new: true }).lean();
    if (patient) return patient;
    const linked = await PatientProfile.exists({ email });
    throw Object.assign(new Error('Patient identity is not linked'), { reason: linked ? 'google_identity_conflict' : 'patient_not_linked' });
  } catch (error) {
    if (error.code === 11000) error.reason = 'google_identity_conflict';
    throw error;
  }
}

module.exports = { digest, challenge, random, normalizeEmail, validEmail, authError, reserveEmailRequest, publicOrigin, googleClient, googleEnabled, googlePatient };
