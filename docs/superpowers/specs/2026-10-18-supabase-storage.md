# MediCluster Supabase storage

User requires Supabase as sole application database; no MongoDB service or driver.
Reuse existing Supabase project without modifying dispatch/crew tables or roles.

Keep current Express endpoints, JWT session contracts, record IDs, clinic-linked
patient identity, encrypted SMS jobs, single-use OTP/Google handoffs, resend limits,
clinical records and ML output. Store document-shaped clinical data in a private
Postgres JSONB record table with indexed identities. Preserve model validation,
defaults, hidden credential fields, dates, sorting and pagination through a small
repository facade; no MongoDB dependency. Database-side RPCs perform conditional
updates/deletes and email reservations atomically. No read-modify-write OTP checks.

Upload binary files to a private Supabase Storage bucket. Backend streams them
using existing media APIs. Never expose service-role keys or a public bucket.
Keep current media identifier API compatible while replacing GridFS.

Use SUPABASE_URL and backend-only SUPABASE_SERVICE_ROLE_KEY. Browser anon key is
insufficient. Additive SQL migration must enable RLS, revoke anon/authenticated
access, grant backend RPCs only to service_role, and avoid existing dispatch data.
Provide installation instructions when local administrative SQL access is absent.
Do not fabricate credentials or claim live migration without applying it.

Verification uses actual Postgres semantics via PGlite for local integration tests,
including concurrency/one-time consumption and role grants. Mock only provider
calls in existing identity/SMS tests. Verify unchanged web suite and build.
