# MediCluster SMS Sender

Separate Android 8+ operator app that sends patient sign-in codes using the phone's default SMS SIM. The patient APK does not send SMS. Carrier SMS charges, quotas, and restrictions still apply; this is a small-volume demo gateway, not a production OTP service.

## Local setup

1. From `medicluster/backend`, run `node scripts/configure-sms-gateway.js`. An optional argument supplies the backend origin, for example `http://192.168.1.10:5000` or an HTTPS deployment URL. This creates a random sender key in the ignored backend `.env` and saves phone settings privately at `~/.local/share/medicluster/sms-sender/setup.txt`. It preserves any existing sender key. Restart backend after configuration.
2. Install the debug APK from `app/build/outputs/apk/debug/app-debug.apk`, or the local frontend's `/downloads/medicluster-sms-sender.apk` after staging a build. This installer is for the sender phone only.
3. Paste **Server URL** and **Sender key** from the private setup file. For local development, phone and backend need a reachable shared network. `localhost` on the phone does not reach the computer. Release builds require HTTPS; debug builds also permit HTTP to private IPv4 addresses.
4. Set the desired default SMS SIM in Android settings. Grant SMS permission, allow sender notifications, and tap **Start sender**. Wait for **Connected**. Keep phone charged, online, and in mobile coverage. Some manufacturers require allowing background battery usage.
5. Open MediCluster `/app`, enter the clinic-linked mobile number, request a code, then enter the SMS code. No SMS is sent automatically by setup or unit tests. A sender phone may need a different SIM/phone to test receipt depending on carrier support for texting itself.

Stop from the app or notification. Reopen app and start again after reboot or Android stops it. No boot receiver starts SMS sending without the operator. The backend detects an offline sender after 30 seconds and rejects new linked-patient OTP requests with a clear error. Jobs already queued expire with the OTP after five minutes.

## Build

Prerequisites: JDK 17, Gradle 8.11.1, Android SDK platform 35 and build tools 35.0.0. Set `JAVA_HOME` and `ANDROID_HOME`.

```sh
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Debug APK is signed with Android's local debug key for direct installation. For distributed updates, add a backed-up release signing key and increment the version code. No sender key or patient credentials belong in an APK or source control. This app is directly installed; Google Play's SMS permission policy requires a separate distribution review before publishing.

## Delivery contract

- `OTP_DELIVERY_MODE=android` selects queue delivery. `SMS_GATEWAY_TOKEN` must contain at least 32 characters. `OTP_DEV_LOG` never overrides Android mode. Production cannot use log-only OTP delivery.
- Sender calls authenticated `POST /api/sms-gateway/claim` every three seconds. Empty claims refresh heartbeat; while a send/result is pending, `POST /api/sms-gateway/heartbeat` keeps it online without claiming another job. Backend atomically claims one unexpired job; concurrent phones cannot claim the same job.
- Queued mobile number/message are encrypted using AES-256-GCM with a key derived from the sender secret. Payload is erased when claimed. Expired, used, or unreadable jobs are not returned. Changing sender key invalidates old heartbeats and queued payloads.
- Phone validates recipient and fixed OTP template, checks expiry, and durably journals the job ID before invoking `SmsManager`. Credentials use Android Keystore; the journal stores no recipient or OTP text. Cleartext HTTP is for local debug networks only.
- Android's sent callback records **sent to mobile network**, not confirmed handset delivery. `POST /api/sms-gateway/jobs/:id/result` reports `sent` or `failed`; acknowledgement retries are idempotent. Timeout, crash, stopped service, or lost claim response can lose a code; claims are never requeued automatically, avoiding duplicate charges and stale SMS. Patient may request a fresh code after cooldown.
- On restart, an interrupted send is reported as unknown/failed and never resent. A pending acknowledgement is completed before another claim. Restore previous URL/key to finish a pending acknowledgement before changing settings; clearing app storage abandons it.
- Backend keeps existing hash-based OTP verification, five-minute expiry, resend/guess limits and patient-only tokens. Successful verification consumes code atomically to prevent parallel replay.

Each handset polls at most one job per cycle and pauses while awaiting a send result. More phones can consume the shared queue, but they share one sender key; per-device revocation, independent monitoring, provider failover, and production throughput are outside this demo.

## Verification limits

Backend tests use a separate temporary MongoDB database and do not send SMS. JVM tests cover URL policy, permitted OTP payloads, expiry, and interrupted-send policy. Robolectric tests exercise persisted journal recovery, late callbacks, and restarting after process death. Build and lint validate Android integration, but SMS permissions, SIM selection, background behavior, and real receipt must also be tested on a physical phone.
