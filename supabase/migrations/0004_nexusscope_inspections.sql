-- ---------------------------------------------------------------------------
-- NexusScope: inspection history
--
-- The product pivoted from APK streaming to link & site inspection. This drops
-- the APK/session schema and replaces it with inspection records.
--
-- Signed-in users keep an unlimited, permanent history (the product rule: a
-- lease or countdown never applies to an authenticated account). Anonymous
-- visitors are served by the in-memory allowance in the API route and are
-- deliberately NOT persisted, so the public demo writes nothing.
-- ---------------------------------------------------------------------------

-- The old tables. `cascade` also removes dependent policies and indexes.
drop table if exists public.session_events cascade;
drop table if exists public.sessions cascade;
drop table if exists public.apks cascade;

create table if not exists public.inspections (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  -- what the user typed, kept verbatim for re-running
  input_url     text not null,
  -- where the fetch actually ended up after redirects
  final_url     text not null,
  host          text not null,
  status_code   integer,
  title         text,
  description   text,
  -- the full report. jsonb so the shape can evolve without a migration.
  report        jsonb not null,
  -- cheap filters for the history view
  duration_ms   integer,
  payload_count integer not null default 0,
  -- free-text label the user can add
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists inspections_owner_created_idx
  on public.inspections (owner_id, created_at desc);

create index if not exists inspections_owner_host_idx
  on public.inspections (owner_id, host);

-- ---------------------------------------------------------------------------
-- Grants
--
-- Table privileges and row-level security are separate mechanisms: RLS decides
-- which *rows* a role may touch, but a role still needs the table privilege
-- first. Missing grants produce `42501 permission denied`, which reads like an
-- empty account rather than a misconfiguration.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.inspections to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security: a user sees only their own inspections.
-- ---------------------------------------------------------------------------
alter table public.inspections enable row level security;

drop policy if exists "inspections owner read"   on public.inspections;
drop policy if exists "inspections owner insert" on public.inspections;
drop policy if exists "inspections owner update" on public.inspections;
drop policy if exists "inspections owner delete" on public.inspections;

create policy "inspections owner read"
  on public.inspections for select
  to authenticated
  using (owner_id = auth.uid());

create policy "inspections owner insert"
  on public.inspections for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "inspections owner update"
  on public.inspections for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "inspections owner delete"
  on public.inspections for delete
  to authenticated
  using (owner_id = auth.uid());

-- The old storage bucket held APK binaries. Nothing writes to it any more.
delete from storage.objects
 where bucket_id = 'apks';
