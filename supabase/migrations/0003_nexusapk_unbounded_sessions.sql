-- 0003_nexusapk_unbounded_sessions.sql
--
-- Signed-in accounts are not time-boxed. A session now stays alive until the
-- user ends it (or an operator opts into a finite lease via
-- NEXUS_SESSION_TTL_SECONDS), so `expires_at` must be nullable.
--
-- Previously `expires_at` was NOT NULL with a 15 minute default, which meant the
-- playground always showed a countdown and the reaper always had a deadline to
-- enforce, regardless of who was signed in.

alter table public.sessions
  alter column expires_at drop not null;

alter table public.sessions
  alter column expires_at drop default;

comment on column public.sessions.expires_at is
  'NULL = no lease (signed-in sessions run until stopped). Non-null only when an operator configures NEXUS_SESSION_TTL_SECONDS, or for demo sessions.';

-- The reaper and the "reuse a live session" lookup both filter on expires_at.
-- A NULL lease never matches `expires_at < now()`, which is exactly what we
-- want: indefinite sessions are never reaped by the clock.
create index if not exists sessions_expires_at_idx
  on public.sessions (expires_at)
  where expires_at is not null;

-- Any session already running under the old 15 minute default is granted a
-- fresh lease-free life instead of being reaped mid-flight.
update public.sessions
set expires_at = null
where state in ('pending', 'provisioning', 'installing', 'running')
  and simulated = false
  and expires_at is not null;
