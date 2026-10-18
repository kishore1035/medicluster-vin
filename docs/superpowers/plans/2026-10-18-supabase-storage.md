# Supabase Storage Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development for independent implementation tasks and one final review.

**Goal:** Remove MediCluster MongoDB dependency and use the existing Supabase project.
**Architecture:** Private indexed JSONB records in Postgres, atomic restricted RPCs,
small model/repository facade, private Supabase Storage for binaries. Existing APIs
and dispatch schema remain intact.
**Tech Stack:** Express, native fetch, Supabase PostgREST/Storage, Postgres SQL, PGlite.
**Spec:** docs/superpowers/specs/2026-10-18-supabase-storage.md

## Global Constraints
- No MongoDB runtime or driver dependency; do not alter dispatch/crew tables.
- Preserve patient-only JWTs, identity linking and OTP/Google/SMS concurrency rules.
- Service-role key stays backend-only; no public access to clinical/credential rows.
- Additive migration only; no production data deletion or unsolicited messages.

## Review Focus
- Parallel OTP/handoff exchanges and SMS claims must succeed once only.
- Hidden hashes/Google subjects/SMS ciphertext stay hidden unless explicitly selected.
- Unknown patient addresses never create accounts or bypass clinic linking.
- Private Storage files retain working upload/download/analyze/delete behavior.
- Missing keys/schema return actionable service errors without credential leakage.

## Repository Contract
- `db/supabase.js`: `rpc(name,args)` -> parsed JSON, `request(path,options)` -> Response.
- `db/model.js`: `defineModel(name,definition,options)` preserving current route query API.
- `db/ids.js`: `createId()` 24 hex, `isValidId(value)`; existing IDs remain strings.
- Collections retain existing lowercase plural model collection names.
- SQL `mc_find(p_collection,p_filter={},p_sort={},p_limit=null,p_skip=0)` -> document array.
- SQL `mc_count(p_collection,p_filter={})` -> integer.
- SQL `mc_write(p_collection,p_action,p_filter={},p_update={},p_document={},p_upsert=false,p_return_new=true,p_sort={})`.
  Actions: insert -> document; update -> document/null; update_many -> matchedCount/modifiedCount;
  delete -> document/null; delete_many -> deletedCount. Insert/update data includes `_id`.
- SQL `mc_reserve_email(p_hash)` -> boolean, enforces 30-second cooldown and five/hour atomically.
- SQL migration at `backend/supabase/migrations/20261018_medicluster_storage.sql`.

## Task 1: Private Postgres schema and atomic operations
- [x] Write real-Postgres tests for conditional consume, nested filters/updates,
  sorted claims, unique identities, rolling reservations, and role denial.
- [x] Implement migration and test helper; inspect all models/routes for actual operators.
- [x] Verify SQL tests with PGlite. No remote schema writes without credentials.

## Task 2: Supabase client, repositories, model conversion
- [x] Write repository tests for projections/defaults/dates/doc.save and error mapping.
- [x] Implement client, ID helpers and repository contract above.
- [x] Convert all model definitions from Mongoose; preserve field behavior and methods.
- [x] Verify repository tests over real SQL fixture once Task 1 is available.

## Task 3: Supabase private media storage
- [x] Add private bucket creation SQL to a separate migration and Storage client tests.
- [x] Replace GridFS upload/download/delete and analysis reads, retaining API IDs.
- [x] Verify no MongoDB/GridFS runtime remains in media handling.

## Task 4: Runtime, identity rate limits, tests, deployment
- [x] Replace server Mongo connection and route ID helpers; switch email limiter to RPC.
- [x] Port existing identity/SMS integration tests to the SQL-backed test fixture.
- [x] Remove Mongoose dependency and Mongo Compose service; update environment/docs.
- [x] Run backend suites, frontend suite/typecheck/build, SQL role/concurrency checks.
- [x] Review full change; fix blockers; integrate and push under existing authorization.
- [ ] Apply schema and live-test: pending backend private key and administrative SQL access; only anon key exists locally.

## Verification record

56 backend tests pass against the real Postgres migration in PGlite.
33 frontend tests and frontend typecheck pass. Modern/legacy/missing key Compose
configurations verified. Independent review caught and verified fixes for compound
sort ordering and Compose key alias support. No MongoDB runtime driver remains.
Live Supabase probe confirms application schema is not installed (PGRST205);
setup SQL is generated for SQL Editor installation.
