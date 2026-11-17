-- ============================================================================
-- NexusAPK Studio — core schema
-- Apply with the Supabase SQL editor or `supabase db push`.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- apks
-- ---------------------------------------------------------------------------
create table if not exists public.apks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  package_name text,
  version_name text,
  version_code integer,
  min_sdk integer,
  target_sdk integer,
  size_bytes bigint not null default 0,
  sha256 text,
  storage_path text not null,
  icon_path text,
  status text not null default 'ready'
    check (status in ('processing', 'ready', 'failed')),
  error_message text,
  launch_count integer not null default 0,
  last_launched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apks_owner_created_idx on public.apks (owner_id, created_at desc);
create index if not exists apks_package_idx on public.apks (package_name);

alter table public.apks enable row level security;

drop policy if exists "apks_select_own" on public.apks;
create policy "apks_select_own" on public.apks
  for select using (auth.uid() = owner_id);

drop policy if exists "apks_insert_own" on public.apks;
create policy "apks_insert_own" on public.apks
  for insert with check (auth.uid() = owner_id);

drop policy if exists "apks_update_own" on public.apks;
create policy "apks_update_own" on public.apks
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "apks_delete_own" on public.apks;
create policy "apks_delete_own" on public.apks
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  apk_id uuid not null references public.apks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  backend_session_id text,
  state text not null default 'pending'
    check (state in ('pending','provisioning','installing','running','stopping','stopped','failed')),
  device_profile text not null default 'phone',
  stream_url text,
  ws_url text,
  adb_port integer,
  container_id text,
  simulated boolean not null default false,
  error_message text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz
);

comment on column public.sessions.simulated is
  'True when the session is rendered by the browser client-side simulator (no container bound).';

create index if not exists sessions_owner_idx on public.sessions (owner_id, started_at desc);
create index if not exists sessions_state_idx on public.sessions (state);

alter table public.sessions enable row level security;

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own" on public.sessions
  for select using (auth.uid() = owner_id);

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own" on public.sessions
  for insert with check (auth.uid() = owner_id);

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own" on public.sessions
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- session_events
-- ---------------------------------------------------------------------------
create table if not exists public.session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  level text not null default 'info' check (level in ('debug','info','warn','error')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists session_events_session_idx
  on public.session_events (session_id, created_at asc);

alter table public.session_events enable row level security;

drop policy if exists "session_events_select_own" on public.session_events;
create policy "session_events_select_own" on public.session_events
  for select using (auth.uid() = owner_id);

drop policy if exists "session_events_insert_own" on public.session_events;
create policy "session_events_insert_own" on public.session_events
  for insert with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists apks_touch_updated_at on public.apks;
create trigger apks_touch_updated_at before update on public.apks
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- provision a profile row for every new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- storage: private APK bucket, namespaced per user
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('apks', 'apks', false, 536870912)
on conflict (id) do nothing;

drop policy if exists "apks_objects_select_own" on storage.objects;
create policy "apks_objects_select_own" on storage.objects
  for select using (
    bucket_id = 'apks' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "apks_objects_insert_own" on storage.objects;
create policy "apks_objects_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'apks' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "apks_objects_update_own" on storage.objects;
create policy "apks_objects_update_own" on storage.objects
  for update using (
    bucket_id = 'apks' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "apks_objects_delete_own" on storage.objects;
create policy "apks_objects_delete_own" on storage.objects
  for delete using (
    bucket_id = 'apks' and (storage.foldername(name))[1] = auth.uid()::text
  );
