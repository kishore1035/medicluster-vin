const axios = require('axios');
const { authError } = require('./patientIdentity');

const emailEnabled = () => ['EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY'].every(key => Boolean(process.env[key]?.trim()));
let deliveryTail = Promise.resolve();
let lastDeliveryAt = 0;

async function sendEmailCode(email, name, code, expiresAt) {
  if (!emailEnabled()) throw authError('Email sign-in is not configured. Ask your clinic for help.');
  // EmailJS allows one request per second. Serialize sends in this server process.
  const delivery = deliveryTail.then(async () => {
    const wait = Math.max(0, lastDeliveryAt + 1100 - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastDeliveryAt = Date.now();
    const body = {
      service_id: process.env.EMAILJS_SERVICE_ID, template_id: process.env.EMAILJS_TEMPLATE_ID, user_id: process.env.EMAILJS_PUBLIC_KEY,
      ...(process.env.EMAILJS_PRIVATE_KEY ? { accessToken: process.env.EMAILJS_PRIVATE_KEY } : {}),
      template_params: {
        email, passcode: code, time: expiresAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
        to_email: email, to_name: name || 'Patient', otp: code, expires_minutes: 5,
      },
    };
    try {
      const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', body, { timeout: 10_000 });
      if (response.status !== 200) throw new Error('Email provider rejected request');
    } catch {
      // Provider exceptions can contain credentials and OTPs: never log or propagate them.
      throw authError('Could not send the email code. Try again shortly.', 502);
    }
  });
  deliveryTail = delivery.catch(() => {});
  return delivery;
}

module.exports = { emailEnabled, sendEmailCode };
