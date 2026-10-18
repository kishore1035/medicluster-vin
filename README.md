# MediCluster

Patient risk analysis, a patient portal, and ambulance dispatch applications.

## Repository structure

```text
medicluster/
  frontend/       React clinician dashboard and patient app (/app)
  backend/        Express API, Supabase records, staff and patient authentication
  ml-engine/      Flask clustering, risk analysis, imaging, NLP and forecasting
  patient-android/ Native patient-only Android APK and build instructions
  crew-android/    Native crew-only Android APK and build instructions
  Dockerfile      Combined frontend/backend deployment
  docker-compose.yml
ambulance-dispatch/
  frontend/
    dispatcher-dashboard/   Dispatcher dashboard and crew app
      supabase/             Database migrations and driver-login Edge Function
    police-dashboard/       Police dashboard
  backend/
    api/                    Express dispatch API
    auth/                   Authentication service
    websocket/              Socket.IO server
    services/               Dispatch, routing, siren detection and other services
  mobile/                   React Native citizen and driver apps
  infrastructure/           Database, routing, cache and failover configuration
  tests/                    Dispatch load tests
```

Keep application paths unchanged when configuring Render or Railway service roots.

## MediCluster local setup

Prerequisites: Node.js 20+, Python 3.10+, and the existing Supabase project.

1. Copy `medicluster/backend/.env.example` to `medicluster/backend/.env`.
2. Set `SUPABASE_URL`, backend-only `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`), a random `JWT_SECRET` of at least 32 characters, and `ML_ENGINE_URL=http://localhost:8080`.
3. Install the additive SQL schema using [Supabase setup](medicluster/backend/supabase/README.md).
4. Set `ALLOWED_STAFF_EMAILS` to the exact email addresses permitted to register staff accounts (comma-separated). This overrides `ALLOWED_EMAIL_DOMAINS`; leave both unset to disable registration. Alternatively, use `ALLOWED_EMAIL_DOMAINS` for domain-based registration.
5. Run each service in a separate terminal:

```bash
# ML engine
cd medicluster/ml-engine
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

```bash
# Backend
cd medicluster/backend
npm ci
npm run dev
```

```bash
# Frontend
cd medicluster/frontend
npm ci
npm run dev
```

Open `http://localhost:3000/login` for staff or `http://localhost:3000/app` for patients.
Patient sign-in supports clinic-linked email codes, Google accounts, and mobile
numbers. See [EmailJS and Google setup](medicluster/backend/PATIENT_AUTH.md), including
the [branded OTP email template](medicluster/backend/email-templates/patient-otp.html).
For SMS through an Android phone and SIM, see [SMS Sender setup](medicluster/sms-sender-android/README.md).
`OTP_DEV_LOG=true` enables server-log codes for local development when Android mode is disabled.

## Dispatch setup

The dispatcher dashboard uses Supabase Auth, database tables, Realtime, and the
`driver-login` Edge Function. Configure these public frontend variables before building:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VITE_MEDICLUSTER_URL=http://localhost:3000
```

```bash
cd ambulance-dispatch/frontend/dispatcher-dashboard
npm ci
npm run dev
```

The **Crew app** card at `/download#crew` offers a signed Android 8.0+ APK,
with the web workspace as a secondary option. It opens the deployed employee-ID/PIN
workflow in a dedicated Android app. See [Crew Android setup](medicluster/crew-android/README.md)
for signing and build instructions. Internet is required; GPS works while using
the app. Installing it does not provision a Supabase account.

Open `http://localhost:5174/#/login` for dispatchers or
`http://localhost:5174/#/driver/login` for crews. Crew sign-in uses an employee ID
and PIN. The driver credentials migration records table setup but omits the SQL
function bodies; restore `driver_pin_check` and `set_driver_pin` from the existing
Supabase project when provisioning a new database.

Dispatch actions use the Supabase-backed REST API in `ambulance-dispatch/backend/api`.
Deploy that Node service and set dashboard build variable `VITE_API_URL` to its
HTTPS URL ending in `/api`. The API accepts existing Supabase sessions and reads
the same CAD tables as the dashboard. Apply the new assignment/readiness SQL
migration before checking backend health. Supabase Realtime handles shared fleet
and incident updates; leave `VITE_WEBSOCKET_URL` unset for this deployment.
The old MongoDB and Redis-backed Socket.IO entry points are not used by this setup.
See [full dispatch Render setup](ambulance-dispatch/DEPLOY_RENDER.md).

## Deployment

| Service | Repository root | Deployment |
| --- | --- | --- |
| MediCluster web + API | `medicluster` | Existing Dockerfile builds React and serves it from Express |
| MediCluster ML | `medicluster/ml-engine` | Existing Dockerfile runs Gunicorn |
| Dispatch dashboard + crew app | `ambulance-dispatch/frontend/dispatcher-dashboard` | Existing Dockerfile, or static build with `npm ci && npm run build`, publish `dist` |
| Dispatch API | `ambulance-dispatch/backend/api` | Node service: `npm ci`, then `npm start`; health `/health` |

Set backend secrets in the hosting provider, including `SUPABASE_URL`,
`SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), `JWT_SECRET`,
and optional Ollama provider credentials. Point `ML_ENGINE_URL` to the deployed ML
service. Docker containers use the hosting provider's `PORT` variable.

Frontend environment variables are embedded at build time. Production links default
to `https://medicluster-dispatch-dix1.onrender.com`; local development uses port 5174.
Set `VITE_DISPATCH_URL` to override the dispatch website URL, then rebuild; the
MediCluster Dockerfile passes this public setting to Vite. The dispatch Dockerfile still needs a
`VITE_MEDICLUSTER_URL` build argument for its return links.

### Separate Render frontend and backend

For the MediCluster backend Node web service, use root `medicluster/backend`,
build command `npm ci`, and start command `npm start`. Keep its Supabase,
JWT, delivery-provider settings, and deployed `ML_ENGINE_URL` configured.

For the separate frontend Node web service, use root `medicluster/frontend`,
build command `npm ci && npm run build`, and start command `npm start`.
Set runtime `BACKEND_URL=https://medicluster-backend.onrender.com` to the actual
backend origin. The frontend production server serves `dist` and forwards `/api`
requests to that backend, including Google callback cookies and APK downloads.
Do not use `serve -s dist` for this setup: it does not forward API requests.

On the backend, set `PATIENT_PUBLIC_ORIGIN` and `CORS_ORIGINS` to the frontend
HTTPS origin. Google OAuth's authorized redirect URI is
`<frontend-origin>/api/patient-auth/google/callback`. Check `/api/health` through
the frontend URL to verify both services and the database together.

The public homepage and `/download` offer role-specific web entry points and the
signed patient Android installer. Signed-in clinicians retain their existing home
dashboard. Dispatch and crew entries open their separate login routes on the deployed
dispatch website. Invalid URL overrides leave those entries unavailable.

Health endpoints: MediCluster `/api/health` verifies Supabase storage and returns 503 until its backend key and SQL schema work; ML `/health`, and ML connectivity
through the web service at `/api/health/ml`.

Do not commit `.env` files, private keys, database credentials, generated builds,
or dependency directories. Public frontend configuration must never contain a
Supabase service-role key.

Application-specific READMEs, deployment files, sample data, migrations, and tests
remain alongside their respective services.
