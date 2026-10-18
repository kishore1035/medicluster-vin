# Patient sign-in setup

Patients can use EmailJS email codes, Google sign-in, or existing SMS delivery. All three issue the same patient-only token and open the same clinic-linked record. Staff sign-in remains separate. Non-production log-only SMS testing remains available when `OTP_DEV_LOG=true` and Android delivery is disabled.

## Link a patient email

A clinician can set the login email using authenticated `PUT /api/patient-app/:patientId/profile` with `{ "email": "patient@example.com" }`. Email addresses are normalized and unique. `"email": ""` unlinks it. Patients cannot change login identifiers through profile updates. Relinking email clears the previous Google subject association. Do not create a second patient record for another sign-in method.

## EmailJS

Follow [email template setup](email-templates/README.md). Set backend `.env` variables from `.env.example`. Live delivery requires your connected email sender and valid EmailJS service/template/account IDs. The app shows email sign-in as unavailable until these values exist. Correct-looking values alone do not prove delivery; verify with your own linked inbox after setup.

Email codes expire after five minutes, allow five guesses, and are consumed atomically once. MongoDB retains a separate reservation history for a rolling five-request-per-hour cap and 30-second cooldown, including concurrent requests. Unknown emails receive the same generic request reply, but no email is sent and no patient account is created. Provider failures consume the request reservation to avoid repeatedly hammering a failing service.

## Google OAuth

1. In Google Cloud Console, configure OAuth consent screen and create an **OAuth client ID → Web application**. Only `openid`, `email`, and `profile` scopes are requested. Add test users while consent screen remains in testing.
2. Set `PATIENT_PUBLIC_ORIGIN` to your public clinic HTTPS origin, with no path or credentials. For local browser testing use `http://localhost:3000`.
3. Register authorized redirect URI exactly as `<PATIENT_PUBLIC_ORIGIN>/api/patient-auth/google/callback`, for example `http://localhost:3000/api/patient-auth/google/callback`. Production routes must reach the Express backend; local Vite already proxies `/api`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in backend `.env`, restart backend, and use **Continue with Google**. Secrets never belong in frontend configuration or APK.

Backend validates browser-bound state, provider PKCE and the Google ID token (signature, audience, issuer, expiry through Google's auth library; nonce explicitly). A verified Gmail or Google Workspace address matching a clinic-linked patient email can establish a stable Google subject association. For non-Google-managed email addresses, use email OTP rather than trusting an old Google email verification. Unknown/unverified/conflicting identities never gain access or create patient records.

Callback returns a 60-second one-time handoff code, never a patient JWT. Redeeming it requires the verifier stored in the initiating browser/WebView. On Android, install the updated patient APK: it opens exact Google-start routes in the system browser, then handles the server's `mediclusterpatient://google-return` handoff into the configured patient portal. Google's own redirect URI remains the HTTPS backend callback. No embedded Google login or JavaScript-to-native bridge is used. Older patient APKs need the update for browser handoff; email OTP works through the web portal.

Browser and native Google sign-in require a secure context for Web Crypto (HTTPS or browser localhost). Cookies use HttpOnly/SameSite=Lax and Secure on HTTPS. Each browser uses one in-flight Google flow; starting another replaces its state cookie. Code exchange is atomic and requires proof, including across apps claiming the same custom URI. Callback query parameters are removed immediately by frontend; backend request logs omit patient-auth query strings.

## Verification

Backend: `node --test tests/*.test.js`. Tests create isolated temporary MongoDB databases and mock only EmailJS/Google provider calls. Frontend: `npm test && npm run build`. Native: see patient Android README for signed build/tests. Real inbox delivery, actual Google consent and physical Android browser return require your provider credentials/device and are not proven by mocked tests.

Official references: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Google auth library](https://github.com/googleapis/google-auth-library-nodejs).
