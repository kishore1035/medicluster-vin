# Android OTP sender implementation plan

**Goal:** Deliver existing MediCluster patient OTPs through an operator-owned Android phone and SIM.

**Architecture:** Existing Express/MongoDB backend creates expiring, encrypted delivery jobs. An authenticated Android foreground service claims each job once, sends through the default SMS SIM, and reports submission results. Existing backend OTP verification remains authoritative. This is a small-volume demo gateway; a provider can replace delivery later.

**Scope:** Separate Android 8+ APK; no patient app SMS permissions, no bulk/general-purpose messaging API, no automatic resend after an ambiguous phone result, no cloud deployment or publishing.

## Tasks

- [x] Backend: regression test existing patient OTP request with online Android gateway, then add encrypted MongoDB jobs, authenticated heartbeat/claim/result endpoints, offline errors, and expiry checks. Test against an isolated local MongoDB database, including parallel claims and failed authentication.
- [x] Android: build separate native Java app with server/key setup, default-SIM validation, explicit Start/Stop, foreground notification, durable duplicate-send prevention and pending acknowledgements. Unit-test URL/job validation and crash recovery policy; build APK and run lint.
- [x] Integration: configure local gateway key privately, disable log-only delivery, expose local APK download, document setup and limitations, and run backend OTP request/claim/ack/verify checks. Real SMS receipt requires installation and activation on user's phone.

## Verification

Backend: `node --test tests/*.test.js`; isolated MongoDB only for gateway integration tests. Android: Gradle unit tests, lint, debug APK build and signature verification. Verify running backend health and offline-sender error; never claim real SMS delivery without physical-phone confirmation.

## Review focus

Expired jobs never send; concurrent claims never return same job; unauthorized callers never see payloads; production HTTPS is required; uncertain sends never retry automatically. Sender key stays outside Git and APK. Stop/restart must preserve acknowledgement journal and reject stale credentials.

## Execution record

Initial backend suite: 1 passed. Work proceeds on `feat/android-otp-sender` in current checkout to update running local project. No commits or external deployment requested.

Final verification: backend 13 tests passed; Android 8 tests passed (including Robolectric journal/lifecycle regressions); Android lint reports no issues; debug APK builds successfully. Frontend 15 tests and production build pass (existing large-chunk warning remains). APK signature verified and local download bytes match build output. Running API health returns 200; unpaired sender rejects requests with explicit offline error and unauthenticated claims return 401.

Independent review found and verified fixes for stale running status after process death and missing heartbeat while waiting for SMS callbacks. Review follow-up found no remaining material defect. No physical Android device attached; SIM sending and real SMS receipt remain manual device verification steps. Local sender settings are in private file outside Git; installer contains no credentials.
