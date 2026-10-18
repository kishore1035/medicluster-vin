# Patient email and Google sign-in

Goal: Add EmailJS email OTP and Google OAuth to existing patient portal and Android shell, retaining SMS and existing patient-scoped sessions.

## Contracts and boundaries

- `GET /api/patient-auth/config` returns `{email, google, sms}` booleans; credentials stay backend-only.
- `POST /request-email-code {email}` and `POST /verify-email {email,code}` provide 6-digit, 5-minute, single-use email OTPs. Delivery uses EmailJS REST template variables `to_email`, `to_name`, `otp`, `expires_minutes`. Atomic reservations enforce 30-second cooldown and 5 requests per hour independently of OTP cleanup.
- Google start takes `handoff_challenge` (base64url SHA-256 of frontend verifier) and `platform=web|android`. Backend web-client code flow validates browser-bound state, provider PKCE, ID-token signature/audience/expiry/issuer and nonce. Only clinic-linked patient identities sign in; never create or expose another patient's record.
- Google callback redirects web clients to `/app?patient_auth_code=<64hex>`; Android clients to `mediclusterpatient://google-return?code=<64hex>`. Ticket expires in 60 seconds and `POST /google/exchange {code,verifier}` consumes it atomically. Patient JWT never travels in a URL. Frontend removes callback parameters immediately.
- Android only opens exact trusted Google-start route externally, accepts strictly validated app return intents, and returns to configured patient origin. Google itself uses configured HTTPS callback, never custom URI or WebView.
- Clinicians can link/unlink patient email. Changing email clears Google association. Patients cannot change authentication identifiers. User's existing VINAYGK record gets previously provided email `vinaygk219@gmail.com`.

## Tasks

- [x] Backend: EmailJS adapter, expiring email OTPs and reservations, provider config, secure Google flow/exchange and patient linking; integration tests use isolated MongoDB and mock only external provider calls.
- [x] Frontend: email/SMS choices, Google sign-in, PKCE handoff, errors and unavailable configuration; node tests, build, rendered mobile/desktop QA.
- [x] Android: trusted external-browser entry and strict one-time handoff intents; navigation tests, lint/build updated patient APK using existing signing key.
- [x] Integration: document provider setup, link local patient email, verify all suites and production build. Real provider sign-in/delivery requires user-owned EmailJS/Google configuration.

Execution: backend by parent, frontend and native in separate agents with fixed interfaces and disjoint file ownership. Preserve earlier uncommitted SMS sender work. No publishing or deployment requested.

## Verification record

- Backend: 28 tests pass, including atomic email reservations/one-time verification, provider failure, expiry/guess denial, browser state/nonce/PKCE checks, proof-bound exchange, native callback shape, and clinician-only email linking.
- Frontend: 25 tests pass; production build passes with existing large-chunk warning.
- Native patient APK: 7 tests pass per debug/release variant; both lint variants have zero errors and 6 existing warnings. Signed version 1.0.5/code5 staged locally, signature verified, installer bytes/hash/metadata verified through backend endpoint.
- Playwright (Browser plugin absent, local Chrome fallback): desktop 1440×1000 and mobile 390×844. Live unconfigured UI, email/SMS switching, mocked delivery/expired-code errors, Google cancellation URL cleanup, and Android-style browser cancellation recovery pass without page errors or horizontal overflow. Email HTML preview checked desktop, mobile, and dark mode. Screenshots/results are outside Git under `/tmp/medicluster-*`.
- Independent review identified and verified fixes for cancelled external Google navigation leaving sign-in disabled, and local log-only SMS readiness regression. Final focused review found no remaining material issue.
- Dependency audit compared against original lockfile: no new vulnerable package; existing baseline remains 11 advisories (4 moderate, 6 high, 1 critical). Unrelated dependency upgrades were not applied.
- Local patient email linked to previously provided account. Live EmailJS delivery, real Google consent, and physical-device handoff remain unverified: provider credentials are absent. No service account creation, real email sending, deployment, or external publication occurred.
