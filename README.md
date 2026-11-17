# NexusAPK Studio

Cloud-native Android APK streaming workspace. Upload an `.apk` and run it in a
browser-based device — real redroid containers streamed over WebRTC when an
orchestrator is connected, or an interactive in-browser simulator when it isn't.

```
┌────────────────────────────┐        ┌──────────────────────────┐
│ Next.js 16 control plane   │  HMAC  │ FastAPI orchestrator     │
│ · glassmorphic UI          │───────▶│ · redroid containers     │
│ · Supabase auth / storage  │        │ · adb port allocation    │
│ · signed URLs + RLS        │        │ · 15-min idle reaper     │
│ · MJPEG proxy + input relay│        │ · MJPEG pump + adb input │
└─────────────┬──────────────┘        └────────────┬─────────────┘
              │                                    │
        ┌─────▼─────┐                       ┌──────▼──────┐
        │ Supabase  │                       │   Docker    │
        │ Postgres  │                       │  redroid    │
        │ + Storage │                       │  scrcpy-web │
        └───────────┘                       └─────────────┘
```

## Quick start

```bash
npm install
cp .env.example .env.local   # add Supabase URL + anon key
npm run dev                  # http://localhost:3000/demo
```

Without any credentials the app still works: `/demo` is a fully interactive
workspace (simulated ingest, booting device, gestures, screenshots) that never
touches a backend. Add Supabase to unlock real accounts, storage and RLS.

### With Supabase

1. Create a project and run the SQL in [`supabase/migrations`](supabase/migrations)
   (or paste it into the SQL editor) — it creates `profiles`, `apks`,
   `sessions`, `session_events`, RLS policies and the private `apks` bucket.
2. Fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Enable the GitHub provider in **Auth → Providers** to switch on OAuth.

### With the container orchestrator (real devices)

```bash
# Linux host with binderfs (macOS/Windows cannot run redroid)
sudo modprobe binder_linux
docker compose up -d redroid-doc scrcpy-web orchestrator

export NEXUS_BACKEND_URL=http://localhost:8000
export NEXUS_BACKEND_TOKEN=dev-token-change-me   # same value in docker-compose.yml
npm run dev
```

The API then provisions one privileged redroid container per session, publishes
a private ADB port, side-loads the APK with `adb install`, and returns WebRTC +
WebSocket endpoints to the playground. When the daemon is unreachable the
orchestrator degrades to the simulator instead of failing the request.

## Architecture

| Layer | Location | Responsibility |
| --- | --- | --- |
| Design system | `app/globals.css`, `components/ui` | Glass tokens, neon edges, motion primitives |
| Landing + auth | `app/page.tsx`, `app/login`, `app/auth` | Marketing surface, OAuth/email/magic-link |
| Dashboard | `app/dashboard` | Library grid, sessions, fleet, settings |
| Playground | `app/playground/[sessionId]`, `components/playground` | Device frame, input mapping, toolbar, console |
| Upload pipeline | `app/api/apks` | Validate → upload → manifest parse → icon extract |
| Session lifecycle | `app/api/session/*`, `app/api/cron/reap` | Start / poll / heartbeat / stop / reap |
| Frame + input proxy | `app/api/stream/[id]/*` | Same-origin MJPEG pipe and input relay |
| Streaming bridge | `backend/app/streaming.py`, `backend/app/adb.py` | Per-session frame pump, adb input translation |
| Orchestrator client | `lib/backend.ts` | Server-only HMAC calls to FastAPI |
| Deviceless renderer | `lib/playground/simulator.ts` | Canvas Android UI driven by the same input frames |
| Container service | `backend/app/docker_service.py` | redroid provisioning, adb, teardown |

### Data model (Supabase)

- `profiles` — one row per auth user, auto-created by trigger
- `apks` — metadata, storage path, extracted icon, launch counters
- `sessions` — state machine (`pending → provisioning → installing → running → stopped`), lease timestamps, streaming endpoints
- `session_events` — append-only workspace log streamed into the console

Every table is protected by row-level security keyed on `auth.uid()`; APK
binaries live in a **private** bucket under `<user_id>/<object_id>/` and are only
reachable through 10-minute signed URLs.

## Streaming architecture

The device feed never exposes the orchestrator to the browser. Two transports,
one contract:

```
browser <img src="/api/stream/{id}/frames">      ──▶ Next.js proxy (cookie auth)
                                                        │ bearer token
                                                        ▼
                                              FastAPI /api/stream/{id}/mjpeg
                                                        │ screencap (8 fps)
                                                        ▼
                                                   adb 127.0.0.1:<port>

browser POST /api/stream/{id}/control            ──▶ Next.js relay
   {type:"touch", action:"up", x, y}                    │ bearer token
                                                        ▼
                                              FastAPI /api/stream/{id}/input
                                                        │
                                                        ▼
                                              adb shell input tap X Y
```

- **Frame pump**: one capture loop per session (`FramePump`) fans frames out to
  N viewers, so ten people watching costs one `screencap` stream, not ten. The
  loop is paced to `NEXUS_STREAM_FPS` and skips overlapping captures.
- **Input**: normalised `0..1` coordinates are scaled to the live display size
  (`wm size`) and translated to `input tap|swipe|keyevent|text`. Down/move
  frames are collapsed — adb has no streaming touch API, so only the completed
  gesture is sent.
- **Auth**: `<img>` and WebSocket handshakes carry no `Authorization` header, so
  the control plane mints an HMAC token bound to `{session_id, expiry}`
  (`lib/stream-token.ts` ↔ `backend/app/security.py`). The same-origin proxy is
  the default because it needs no CORS and keeps the backend private;
  `NEXUS_STREAM_PUBLIC_URL` switches to direct signed URLs.
- **WebRTC upgrade path**: if `NEXUS_WEBRTC_BASE` / `NEXUS_SCRCPY_WS_BASE` are
  set, the client negotiates WebRTC and speaks the raw WebSocket protocol
  instead; the UI is transport-agnostic (`useDeviceStream`).

## Input protocol

The browser speaks one JSON frame format to either transport:

```ts
{ type: "touch", action: "down" | "move" | "up", x, y, pressure }  // normalised 0..1
{ type: "swipe", x1, y1, x2, y2, duration }
{ type: "key", text } | { type: "key", keyCode }
{ type: "command", action: "rotate" | "screenshot" | "power" | "home" | "back" | ... }
```

`useDeviceStream` sends frames to the WebSocket bridge when a session is
container-backed and to the canvas simulator otherwise, so the UI has no
transport-specific branches.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/apks` | Multipart APK ingest (≤512 MB, zip-signature checked) |
| `GET` | `/api/apks/[id]` | Record + 10-min signed download URL |
| `DELETE` | `/api/apks/[id]` | Purge row + storage objects |
| `GET` | `/api/assets?path=` | Auth-gated icon proxy |
| `POST` | `/api/session/start` | Provision or reuse a device session |
| `GET` | `/api/session/[id]` | Poll state (proxies orchestrator liveness) |
| `POST` | `/api/session/[id]/heartbeat` | Extend the lease |
| `POST` | `/api/session/[id]/stop` | Destroy container, close session |
| `GET/POST` | `/api/session/[id]/events` | Workspace console log |
| `GET` | `/api/stream/[id]/frames` | Same-origin MJPEG device feed |
| `POST` | `/api/stream/[id]/control` | Input frame relay (cookie-auth) |
| `GET` | `/api/cron/reap` | Reap expired sessions (`CRON_SECRET`) |
| `DELETE` | `/api/account` | Self-service account + storage purge |
| `GET` | `/api/health` | Subsystem readiness, never leaks secrets |

Orchestrator endpoints: `POST /api/session/start`, `POST /api/session/stop`,
`GET /api/session/{id}`, `POST /api/session/{id}/heartbeat`, `GET /api/healthz`.

## Configuration

| Variable | Scope | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | web | — |
| `SUPABASE_SERVICE_ROLE_KEY` | server | — |
| `NEXUS_BACKEND_URL` / `NEXUS_BACKEND_TOKEN` | server | — |
| `NEXUS_SESSION_TTL_SECONDS` | web + worker | unset = unlimited |
| `NEXUS_MAX_UPLOAD_BYTES` | web | `536870912` |
| `NEXUS_APK_BUCKET` | web | `apks` |
| `CRON_SECRET` | server | — (required in prod) |
| `NEXUS_STREAM_PUBLIC_URL` | web | — (defaults to same-origin proxy) |
| `NEXUS_STREAM_FPS` | worker | `8` |
| `NEXUS_REDROID_IMAGE` | worker | `redroid/redroid:13.0.0_64only-latest` |
| `NEXUS_ADB_PORT_START` / `_END` | worker | `5555` / `5699` |
| `NEXUS_MAX_CONCURRENT_SESSIONS` | worker | `8` |

## Access model

Signed-in users are not time-boxed. An authenticated account gets the whole
platform: upload, launch, full device control, keyboard bridge, screenshots and
downloads, for as long as it needs.

| | Demo (`/demo`) | Signed in |
| --- | --- | --- |
| Account required | no | yes |
| Session lease | 15 minutes, counts down | **none — runs until you stop it** |
| Device simulator | local canvas | container + MJPEG, or simulator fallback |
| Storage / library | in-memory sample | Supabase, RLS-scoped to the owner |
| Download APK | — | yes, signed same-origin URL |

The countdown that used to appear in the toolbar was a bug: `NEXUS_SESSION_TTL_SECONDS`
defaulted to `900`, so every session — signed in or not — received a 15 minute
`expires_at` and the toolbar rendered the remaining time. The rule now lives in
one module, `lib/session-policy.ts`:

* no `NEXUS_SESSION_TTL_SECONDS` (the default) → `expires_at` is `NULL`, the
  toolbar shows elapsed uptime with a `live` badge, and nothing counts down;
* a positive value → a lease, a countdown, and the reaper reclaims on expiry;
* the demo always keeps a 15 minute lease because it is explicitly a tour.

Capacity is still protected without timers: the reaper only reclaims a *real*
container that has sent no heartbeat for `SESSION_IDLE_GRACE_SECONDS` (30 min),
and simulated sessions are never reaped. Assert the policy with:

```bash
npm run verify:policy
```

## Deployed environment

Production runs on Vercel, project **nexusapk-studio**
(`prj_BU6jZ4LFC0c8bpDaURfIESntNtdR`), linked to `kennedy-blip/Nexus-apk` with
root directory `/` and framework preset Next.js.

* Production URL: `https://nexusapk-studio.vercel.app`
* Branch previews deploy from `arena/*` refs.
* `vercel.json` registers the reaper cron (`/api/cron/reap`, `0 3 * * *`) and
  raises `maxDuration` for the stream routes.
* With the default deployment protection the project is private; disable SSO
  protection in *Project → Settings → Deployment Protection* before sharing the
  URL publicly.

Supabase auth is configured with the deployment's callback URLs:

```
https://nexusapk-studio.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

GitHub OAuth is enabled on the Supabase project, so "Continue with GitHub"
works on both the deployed and local origins.

### Table privileges are not optional

`0001_nexusapk_core.sql` creates tables and policies but the project's `public`
default ACL only handed `anon`/`authenticated` `TRUNCATE, REFERENCES, TRIGGER`.
Policies without grants mean every PostgREST request fails with
`42501 permission denied for table apks`, which surfaces in the UI as an empty
library. `0002_nexusapk_grants.sql` fixes this; apply it after the schema
migration on any new project, and after creating tables by hand in the SQL
editor.

Verify with a real user context rather than the dashboard:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
select count(*) from public.apks;   -- own rows only
rollback;
```

## Verification

```bash
npm run typecheck         # strict TS across app + components + lib
npm run lint              # eslint (next core-web-vitals + typescript)
npm run build             # production build (all routes)
cd backend && pytest      # 24 orchestrator + streaming tests
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, build, pytest and a
Docker build of the orchestrator image on every push.

Both suites pass in this repo; the orchestrator tests run without Docker by
exercising the simulator fallback path.

## Notes and limits

- redroid requires a Linux host with `binder_linux`/ashmem; macOS and Windows
  hosts cannot run real sessions (the simulator still works everywhere).
- The simulator is a genuine state machine (launcher, app drawer, gesture
  navigation, notification shade, rotation) so the control path is testable
  without GPUs — it is **not** a substitute for the container at runtime.
- Fonts load from Google Fonts at runtime with a system-UI fallback so the build
  has no network dependency.
- MJPEG is capture-bound: expect 8-12 fps on a modest node, which is fine for
  app QA and demos but not for 60 fps gaming. The WebRTC path exists for that;
  it needs a GPU node and a scrcpy bridge configured.
