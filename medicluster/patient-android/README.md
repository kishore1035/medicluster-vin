# MediCluster Patient — Android

Installable Android 8.0+ app for patients. It opens the existing HTTPS patient portal,
not clinician or dispatch screens. Internet is required. It uses the same linked-mobile
OTP login and patient API authorization as the website; SMS delivery must be configured
separately. Installing the APK does not configure SMS or background medicine alerts.

## Design

A small native Android WebView shell loads `https://medicluster-wiu3.onrender.com/app`.
Patient routes stay in the app. Phone calls open the dialer; external HTTPS links open
another app. Non-patient routes on the clinic origin are blocked. The frontend recognizes
the shell's user agent to hide staff links and the desktop phone frame. This hint is for
presentation, not authentication. There is no JavaScript-to-native bridge.

Location permission is requested only for the configured HTTPS origin. Denying permission
leaves the rest of the portal usable. Photo selection uses Android's picker. HTTPS errors
are never bypassed. An unavailable server shows a retry screen. Records and reminders
need a network connection; the native app does not add offline clinical storage or
reliable alarms when the app is closed.

## Build and publish

GitHub Actions workflow **Patient Android APK** runs tests, Android lint, a signed release
build, and signature verification. It publishes the APK and checksum metadata into
`frontend/public/downloads/`, triggering the normal website deployment. Keeping the
installer in the website means patients need no GitHub account even when this repo is
private. Run the workflow manually for a new version; native source changes on `main`
also trigger it. Website-only changes do not require rebuilding the shell.

Required Actions secrets:

- `PATIENT_KEYSTORE_BASE64`: base64-encoded release keystore.
- `PATIENT_KEYSTORE_PASSWORD`: keystore password.
- `PATIENT_KEY_ALIAS`: release key alias.
- `PATIENT_KEY_PASSWORD`: key password.

Back up the signing key and passwords outside Git. Every update must use the same key
and a higher version code. Losing the key prevents installing updates over existing apps.
No signing key, password, API credential, or patient data belongs in the APK source.

Local build prerequisites: JDK 17, Gradle 8.11.1, Android SDK platform 35 and build tools
35.0.0. Set `ANDROID_HOME` and the signing environment variables above (use
`PATIENT_KEYSTORE_PATH` instead of base64). Then run from this directory:

```bash
gradle :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease
```

`PATIENT_APP_ORIGIN` can override the clinic's HTTPS origin. Changing it requires a new
APK. Release version defaults to 1.0.0/code 1 locally; CI assigns increasing run numbers.

After website deployment, `/app` offers **Download Android app** on the patient login
screen. Share `/download` for installation. Legacy `/downloads/medicluster-patient.apk`
links redirect there, including URLs with checksum query parameters. The download
button fetches `POST /api/patient-installer`, checks size and SHA-256, then saves
one APK without navigating away. HTML wake-up pages never become APK downloads.
Release metadata and SHA-256 are in `/downloads/patient-app.json`. Android may ask the user to
allow installation from their browser. This is direct distribution, not a Play Store listing.
