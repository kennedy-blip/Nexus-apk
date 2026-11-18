-- 0002_nexusapk_grants.sql
--
-- Row-level security decides WHICH ROWS a request may touch; table privileges
-- decide WHETHER the request is allowed to touch the table at all. Both are
-- required, and the original schema migration only created policies.
--
-- On this project the `public` default ACL is:
--     postgres=arwdDxtm  anon=Dxtm  authenticated=Dxtm  service_role=Dxtm
-- so tables built by `postgres` (e.g. via the SQL editor) came out with only
-- TRUNCATE/REFERENCES/TRIGGER for the API roles. Every PostgREST query from the
-- browser and from server routes failed with:
--     42501 permission denied for table apks
-- which surfaced as an empty library instead of an error.
--
-- This migration restores the grants Supabase's own default ACL intends
-- (anon/authenticated: SELECT/INSERT/UPDATE/DELETE, no DDL) and removes
-- TRUNCATE, which no API role should ever hold on a tenant table.
--
-- Verified against the live project after applying:
--   * owner (auth.uid() = owner_id) sees exactly their own rows
--   * a different authenticated user sees 0 rows in apks/sessions/session_events
--   * inserting a row owned by someone else raises
--       42501 new row violates row-level security policy for table "apks"
-- so the grants do not widen visibility: RLS still gates every row.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.apks,
  public.sessions,
  public.session_events,
  public.profiles
to authenticated;

-- Public/marketing surfaces only ever read; no writes without a session.
grant select on table
  public.apks,
  public.profiles
to anon;

-- service_role bypasses RLS, and the reaper / account-deletion paths need DML.
grant select, insert, update, delete on table
  public.apks,
  public.sessions,
  public.session_events,
  public.profiles
to service_role;

-- session_events.id is a bigint identity column, so inserts need the sequence.
grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- No API role may empty a tenant table or rewind a sequence.
revoke truncate on table
  public.apks,
  public.sessions,
  public.session_events,
  public.profiles
from anon, authenticated, service_role;
