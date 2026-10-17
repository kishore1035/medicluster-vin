# MediCluster

Patient risk analysis, a patient portal, and ambulance dispatch applications.

## Repository structure

```text
medicluster/
  frontend/       React clinician dashboard and patient app (/app)
  backend/        Express API, MongoDB models, staff and patient authentication
  ml-engine/      Flask clustering, risk analysis, imaging, NLP and forecasting
  patient-android/ Native patient-only Android APK and build instructions
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

Prerequisites: Node.js 20+, Python 3.10+, and MongoDB.

1. Copy `medicluster/backend/.env.example` to `medicluster/backend/.env`.
2. Set `MONGO_URI`, a random `JWT_SECRET` of at least 32 characters, and `ML_ENGINE_URL=http://localhost:8080`.
3. Set `ALLOWED_EMAIL_DOMAINS` to the comma-separated work email domains permitted to register staff accounts.
4. Run each service in a separate terminal:

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
Patient sign-in requires a clinic-linked mobile number. SMS delivery is not implemented;
`OTP_DEV_LOG=true` enables server-log codes for development only.

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

Open `http://localhost:5174/#/login` for dispatchers or
`http://localhost:5174/#/driver/login` for crews. Crew sign-in uses an employee ID
and PIN. The driver credentials migration records table setup but omits the SQL
function bodies; restore `driver_pin_check` and `set_driver_pin` from the existing
Supabase project when provisioning a new database.

Some dispatch actions still use the REST API and Socket.IO services. Configure
`VITE_API_URL` and `VITE_WEBSOCKET_URL` for those services and verify authentication
compatibility before using those actions. Deploying the dashboard alone does not
complete these integrations.

## Deployment

| Service | Repository root | Deployment |
| --- | --- | --- |
| MediCluster web + API | `medicluster` | Existing Dockerfile builds React and serves it from Express |
| MediCluster ML | `medicluster/ml-engine` | Existing Dockerfile runs Gunicorn |
| Dispatch dashboard + crew app | `ambulance-dispatch/frontend/dispatcher-dashboard` | Existing Dockerfile, or static build with `npm ci && npm run build`, publish `dist` |

Set backend secrets in the hosting provider, including `MONGO_URI`, `JWT_SECRET`,
and optional Ollama provider credentials. Point `ML_ENGINE_URL` to the deployed ML
service. Docker containers use the hosting provider's `PORT` variable.

Frontend environment variables are embedded at build time. Set `VITE_DISPATCH_URL`
to the dispatch website URL on the MediCluster service, then rebuild; its Dockerfile
passes this public setting to Vite. The dispatch Dockerfile still needs a
`VITE_MEDICLUSTER_URL` build argument for its return links.

The public homepage and `/download` offer role-specific web entry points and the
signed patient Android installer. Signed-in clinicians retain their existing home
dashboard. Until `VITE_DISPATCH_URL` is configured, dispatch and crew entries show
Coming soon instead of sending visitors to a local development server.

Health endpoints: MediCluster `/api/health`, ML `/health`, and ML connectivity
through the web service at `/api/health/ml`.

Do not commit `.env` files, private keys, database credentials, generated builds,
or dependency directories. Public frontend configuration must never contain a
Supabase service-role key.

Application-specific READMEs, deployment files, sample data, migrations, and tests
remain alongside their respective services.
