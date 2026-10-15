-- Applied to project djyephboyfoglucmcopn on 2026-10-15 (migrations: driver_pin_credentials, harden_function_grants).
-- Ambulance-crew sign-in: employee ID + 4-digit PIN, checked only server-side (edge function `driver-login`).
create table if not exists public.driver_credentials (
  employee_id     text primary key check (employee_id ~ '^[A-Z]{2,6}-[0-9]{2,8}$'),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.driver_credentials enable row level security;
revoke all on public.driver_credentials from anon, authenticated;
-- driver_pin_check(employee_id, pin) → user id or null; locks 15 min after 5 misses.
-- set_driver_pin(employee_id, user_id, pin) → create/reset a crew PIN. Both service_role only.
-- Full function bodies: see the Supabase dashboard (Database → Functions) or `supabase db pull`.
