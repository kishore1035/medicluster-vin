# MediCluster Supabase setup

MediCluster uses the existing Supabase project for application records and a
private `medicluster-media` Storage bucket. No MongoDB service is needed. Existing
dispatch/crew tables, Supabase Auth users and driver credentials stay in place.

## Install schema once

Run from `medicluster/backend`:

```bash
npm ci
npm run db:sql
```

Copy the SQL output (starting with the first SQL comment, excluding npm command
headings) into the existing project's **SQL Editor**, then select **Run**.
Alternatively, put a Supabase Management API personal access token in
`SUPABASE_ACCESS_TOKEN` and run `npm run db:apply`. A service-role API key permits
backend data access but cannot install SQL schema through the REST data API.
The migration is additive and can be run again safely.

## Backend environment

Set these in both backend `.env` and the Render MediCluster web service:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_BACKEND_SECRET_KEY
JWT_SECRET=YOUR_EXISTING_LONG_JWT_SECRET
PATIENT_PUBLIC_ORIGIN=https://medicluster-wiu3.onrender.com
```

`SUPABASE_SERVICE_ROLE_KEY` is supported as an alternative to `SUPABASE_SECRET_KEY`
for existing service-role JWTs. Browser `anon`/publishable keys cannot operate the
private application repository. Keep the existing EmailJS/Google/SMS/ML provider
settings. Supabase keys do not replace those delivery providers.

In Render select **Save and deploy**. `GET /api/health` returns HTTP 200 with
`database: "supabase"` when the backend credentials and SQL schema are ready;
otherwise it returns HTTP 503. No key values appear in the response.

Application records live in `public.medicluster_records` with collection-specific
identity indexes and private RLS. Atomic Postgres RPCs enforce one-use OTPs,
Google handoffs, SMS claims and rolling email limits. Stored clinical/ML records
retain their existing API shape and string IDs. The backend removes expired auth/SMS
records in bounded batches on startup and every 15 minutes. Binary objects stay private;
existing media endpoints deliver them through the backend.

Existing clinic profiles must be imported/provisioned through the staff API.
Unknown email addresses never create patient accounts. This schema installation
does not copy local patient data or automatically enroll dispatch users as patients.

## Verification

`npm test` runs Postgres-backed integration tests without MongoDB or live delivery.
PGlite executes the real storage migration locally; provider sends are mocked.
Real inbox delivery and deployed Google consent need a linked patient profile and
working provider settings. Storage tests verify the authenticated transport; a
live object upload needs the configured private bucket.
