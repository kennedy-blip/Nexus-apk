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
| `GET` | `/api/cron/reap` | Reap expired sessions (`CRON_SECRET`) |
| `GET` | `/api/health` | Subsystem readiness, never leaks secrets |

Orchestrator endpoints: `POST /api/session/start`, `POST /api/session/stop`,
`GET /api/session/{id}`, `POST /api/session/{id}/heartbeat`, `GET /api/healthz`.

## Configuration

| Variable | Scope | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | web | — |
| `SUPABASE_SERVICE_ROLE_KEY` | server | — |
| `NEXUS_BACKEND_URL` / `NEXUS_BACKEND_TOKEN` | server | — |
| `NEXUS_SESSION_TTL_SECONDS` | web + worker | `900` |
| `NEXUS_MAX_UPLOAD_BYTES` | web | `536870912` |
| `NEXUS_APK_BUCKET` | web | `apks` |
| `CRON_SECRET` | server | — (required in prod) |
| `NEXUS_REDROID_IMAGE` | worker | `redroid/redroid:13.0.0_64only-latest` |
| `NEXUS_ADB_PORT_START` / `_END` | worker | `5555` / `5699` |
| `NEXUS_MAX_CONCURRENT_SESSIONS` | worker | `8` |

## Verification

```bash
npx tsc --noEmit          # strict TS across app + components + lib
npm run build             # production build (all routes)
cd backend && pytest      # orchestrator API contract tests
```

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
