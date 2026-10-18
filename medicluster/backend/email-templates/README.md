# Patient OTP email — EmailJS setup

Open `patient-otp.html` to preview. Paste its HTML into EmailJS template's **Edit Content → Code editor**. Layout uses inline styles and presentation tables with no external images, fonts, scripts or tracking. Mobile and dark-mode rules enhance clients that support them. `patient-otp.txt` provides an optional plain-text equivalent.

Use these template settings:

| Field | Value |
| --- | --- |
| Subject | Your MediCluster sign-in code |
| To Email | `{{email}}` |
| From Name | MediCluster |
| From Email | Use default connected sender |
| Reply To | Your monitored clinic support address |
| Code | `{{passcode}}` |
| Expiry time | `{{time}}` |

The backend sends a six-digit code, five-minute expiry, and formatted expiry time in Asia/Kolkata. Keep template's expiry text at **5 minutes**, rather than the default EmailJS example's 15 minutes. Test preview values: `email=you@example.com`, `passcode=123456`, `time=11:25 am IST`.

Configure backend `.env` with `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, and optionally `EMAILJS_PRIVATE_KEY` if enabled in account security settings. Enable requests from non-browser applications in EmailJS settings. Restart backend; `/api/patient-auth/config` shows readiness without exposing keys. Never put private keys in Vite variables.

Code creation, expiry, hashing, resend/guess limits and verification remain on the backend. EmailJS handles delivery only. Provider rejections do not report success or leave a usable code behind. Backend serializes email requests to respect EmailJS's one-request-per-second limit within one process; larger multi-instance deployments need a shared mail queue.

References: [EmailJS send API](https://www.emailjs.com/docs/rest-api/send/), [EmailJS authorization options](https://www.emailjs.com/docs/sdk/options/).
