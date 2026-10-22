# MediCluster Crew for Android

Install from the **Crew app → Download Android** button at `/download#crew`.
Android 8.0+ and internet access are required. This is a separate signed package
(`com.medicluster.crew`), with its own icon and private app storage. It opens the
live crew workflow at `https://medicluster-dispatch-dix1.onrender.com/#/driver/login`.
Sign in with an existing Supabase employee ID and PIN; installation does not create
or change any accounts. The older Expo driver prototype is not used by this build.

The native WebView shell keeps crew sessions, handles Android location consent,
and opens phone calls/maps in external apps. Only the trusted HTTPS crew routes
load inside the app. Mixed content, file access, and arbitrary launch URLs are
blocked. Supabase still enforces roles and data access.

Location is available while using the app. This release does not add a background
tracking service, offline maps, or push delivery while the app is closed. Existing
crew features use the same deployed web code and backend services as the browser.

## Build

Use JDK 17, Gradle 8.11.1, Android SDK 35 and build-tools 35.0.0:

```bash
gradle :app:testDebugUnitTest :app:testReleaseUnitTest :app:lintDebug :app:lintRelease
```

Production builds require these environment variables (keep signing values outside Git):

- `CREW_APP_ORIGIN`: HTTPS dispatch origin; defaults to the production URL above.
- `CREW_VERSION_CODE`, `CREW_VERSION_NAME`: default `1`, `1.0.0`.
- `CREW_KEYSTORE_PATH`, `CREW_KEYSTORE_PASSWORD`, `CREW_KEY_ALIAS`, `CREW_KEY_PASSWORD`.

```bash
gradle :app:assembleRelease
apksigner verify --verbose --print-certs app/build/outputs/apk/release/app-release.apk
```

The Crew and Patient packages share the existing MediCluster Android publisher
signing certificate. `.github/workflows/crew-android.yml` restores the existing
`PATIENT_KEYSTORE_*`/`PATIENT_KEY_*` GitHub secrets, tests/signs the Crew package,
and publishes the APK plus `crew-app.json` to the MediCluster website source.
Native changes trigger that workflow; web updates arrive through the deployed
crew website. Preserve the publisher key for future APK updates.

Downloads fetch the frontend asset `GET /downloads/medicluster-crew.apk` with
`X-MediCluster-Installer: 1` and verify release byte size and SHA-256 before saving
`MediCluster-Crew.apk`. This also works when frontend and backend deploy separately.
On the combined server, legacy direct APK navigations redirect to `/download#crew`,
avoiding repeated downloads during server cold starts.
