# Dispatch on Render with existing Supabase

Deploy the dashboard and API in your dispatch Render account. MediCluster can
remain in its own Render account. Both dispatch services use the same existing
Supabase project; no MongoDB or Redis URL is needed by the migrated API.

## 1. Install the API functions

In your existing Supabase project's SQL Editor, run the complete contents of
`frontend/dispatcher-dashboard/supabase/migrations/20261018144157_dispatch_api_rpc.sql`.
It requires the CAD schema already installed by `20260816_init_cad_schema.sql`.
It preserves existing data and adds atomic assignment and non-sensitive readiness
functions. It can be run again safely. Enable Realtime for `incidents`,
`ambulances`, and `hospitals` in the Supabase project if not already enabled.

This is not a MongoDB data import. Existing dispatcher data stays in the existing
Supabase tables. MongoDB-only historical records, if any, require a separate import.

## 2. Deploy dispatch-backend

Connect GitHub repository `vinay3254/medicluster`, branch `main`.

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | `ambulance-dispatch/backend/api` |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check | `/health` |

Environment:

```env
NODE_ENV=production
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
CORS_ORIGIN=https://YOUR_DISPATCH_FRONTEND.onrender.com
```

Use the exact dashboard origin without a trailing slash for CORS. Add multiple
origins separated by commas if required. Render supplies `PORT`. Do not set
`MONGODB_URI`, `DATABASE_URL`, `REDIS_URL`, or legacy microservice URLs for this API.
The readiness check returns 503 until configuration and the SQL functions work.

## 3. Deploy dispatch-frontend

| Setting | Node Web Service | Static Site alternative |
| --- | --- | --- |
| Root directory | `ambulance-dispatch/frontend/dispatcher-dashboard` | same |
| Build command | `npm ci && npm run build` | same |
| Start command | `npx --yes serve@14.2.4 -s dist -l tcp://0.0.0.0:$PORT` | none |
| Publish directory | not applicable | `dist` |

Use Node 22.12 or later (for example Render environment `NODE_VERSION=22`).
Set these frontend environment values before rebuilding:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
VITE_API_URL=https://YOUR_DISPATCH_BACKEND.onrender.com/api
VITE_MEDICLUSTER_URL=https://medicluster-frontend.onrender.com
```

Leave `VITE_WEBSOCKET_URL` unset. The dashboard and crew app already subscribe to
Supabase Realtime. Never put a Supabase secret/service-role key in frontend values.
For Static Site hosting, add rewrite `/*` to `/index.html` for any non-hash links.

## 4. Verify and link

- Backend `/health` must return `status: "healthy"` and `supabase: "reachable"`.
- Dispatcher login is `<dashboard-origin>/#/login`; crew is `/#/driver/login`.
- Staff need Supabase Auth users and trusted `profiles` rows with `DISPATCHER` or
  `ADMIN` roles. A MediCluster clinician account is a separate account.
- Crew login uses the existing `driver-login` Edge Function and employee-ID/PIN
  credentials. Keep that function deployed in the same Supabase project.
- Create a real incident, assign an available ambulance and hospital, and check
  the existing incident, fleet, and timeline rows. Failed writes must show errors.
- In Medicluster frontend build settings set `VITE_DISPATCH_URL` to the new
  dispatch dashboard origin, then rebuild Medicluster so its links follow it.

The legacy `dispatch-websocket` service and its Redis instance are unnecessary
for this Supabase Realtime path. They can remain untouched while you verify the
migrated API. This migration does not claim to implement unrelated legacy service
features such as tracking history, siren detection, or arbitrary analytics proxies.
