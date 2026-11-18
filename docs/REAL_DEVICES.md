# Running real Android devices (your APK actually executing)

The deployed app runs on Vercel, which is a serverless platform: it cannot run a
privileged Android kernel. So with no device host connected, `/playground`
renders the **simulator** — a canvas re-creation of Android. Your APK is parsed,
stored, downloadable and listed, but it is **not executing**, so its real screens
never appear. The UI now says this plainly.

This page is how you close that gap. One Linux machine is all it takes.

---

## 1. What you need

| Requirement | Why |
|---|---|
| Linux x86_64 host with `binder` + `ashmem` | redroid runs a real Android userspace; it needs binderfs |
| Docker Engine + Compose v2 | runs the redroid container and the orchestrator |
| ≥ 4 vCPU, 6 GB RAM, 20 GB disk | one Android 13 handset's worth |
| A public HTTPS URL | Vercel must reach the orchestrator to start sessions |

Good candidates: a Hetzner CX32, a DigitalOcean 8 GB droplet, an Oracle Cloud
free-tier ARM/x86 instance, or any spare Linux box. **macOS and Windows cannot
do this** — the kernel support isn't there.

---

## 2. Bring the stack up

```bash
git clone https://github.com/kennedy-blip/Nexus-apk.git
cd Nexus-apk

# binder must be loaded on the host
sudo apt install -y linux-modules-extra-$(uname -r)
sudo modprobe binder_linux
ls /dev/binderfs || (sudo mkdir -p /dev/binderfs && sudo mount -t binder binder /dev/binderfs)

# pick a shared secret — this becomes NEXUS_BACKEND_TOKEN in Vercel
export NEXUS_BACKEND_TOKEN="$(openssl rand -hex 32)"
echo "$NEXUS_BACKEND_TOKEN"     # copy this somewhere safe

docker compose up -d redroid-doc orchestrator
docker compose logs -f orchestrator
```

Verify the device booted:

```bash
docker exec nexus-redroid-dev adb devices       # expect an emulator-* entry
curl -s localhost:8000/api/healthz               # expect {"status":"ok", ...}
```

---

## 3. Expose it to Vercel over HTTPS

Vercel must reach the orchestrator over the public internet on HTTPS. A tunnel is
the quickest safe route (and avoids opening port 8000 to the world):

```bash
# Cloudflare Tunnel (stable hostname, no inbound ports)
cloudflared tunnel --url http://localhost:8000
#   → https://<random>.trycloudflare.com

# …or ngrok
ngrok http 8000
#   → https://<random>.ngrok-free.app
```

Lock the orchestrator down so only Vercel can drive it — it already requires the
bearer token, and you can additionally bind the tunnel to `/api/*`.

### The MJPEG feed needs the same origin

Frame streaming is proxied through the Next.js app (`/api/stream/:id/frames`),
which pipes from the orchestrator with the token. That works through a tunnel
with no extra configuration — leave `NEXUS_STREAM_PUBLIC_URL` unset.

Set it only if you want the browser to connect to the orchestrator **directly**
(lower latency, but the orchestrator must then be publicly reachable and CORS
must allow your site):

```bash
NEXUS_STREAM_PUBLIC_URL=https://<your-tunnel-host>
```

---

## 4. Point the deployment at it

```bash
npx vercel env add NEXUS_BACKEND_URL production      # https://<tunnel-host>
npx vercel env add NEXUS_BACKEND_TOKEN production    # the secret from step 2
npx vercel redeploy <latest-deployment-url>
```

Then confirm:

```bash
curl -s https://nexusapk-studio.vercel.app/api/health | jq .services
# {
#   "database": "ready",
#   "orchestrator": "ready",        <-- this must say ready
#   "orchestratorDetail": null,
#   "sessionLease": "unlimited"
# }
```

When `orchestrator` is `ready`, launching an app from the library boots a real
Android 13 container, installs your APK into it, and streams its actual
framebuffer. The playground header switches from **Simulated** to **Live**, and
the FPS/latency readouts become real measurements.

---

## 5. What each mode actually does

| | No orchestrator (today) | Orchestrator connected |
|---|---|---|
| Header badge | `Simulated` | `Live` |
| What renders | canvas re-creation of Android | your APK's real framebuffer |
| Your APK executes | **no** | yes, inside redroid |
| Gestures / keys | yes (drive the simulator) | yes (drive real adb) |
| Screenshot | canvas snapshot | real framebuffer |
| FPS / latency | measured canvas cadence / `—` | measured frame rate / real input RTT |
| Session length | unlimited | unlimited |

---

## 6. Known constraints of the redroid path

- **CPU-only rendering.** `redroid_gpu_mode=guest` means software GL. Most apps
  work; heavy 3-D games will be slow. A GPU node with
  `androidboot.redroid_gpu_mode=host` fixes that if you need it.
- **APK install happens per session.** A ~40 MB APK adds roughly 10-20 s to boot.
- **Streaming is MJPEG** at `NEXUS_STREAM_FPS` (default 8). Expect 8-12 fps:
  fine for QA and demos, not for 60 fps gaming. The WebRTC upgrade path
  (`scrcpy` + a GPU node) is a separate, larger piece of work.
- **One container per session.** `NEXUS_MAX_CONCURRENT_SESSIONS` (default 8)
  caps how many handsets a host runs; raise it only with the RAM to match.

---

## 7. Sanity-checking a real session

Once `/api/health` reports `orchestrator: ready`:

```bash
# boot a session for an APK you own (needs a browser session cookie, so the
# easiest check is the UI). Then inspect the record:
select id, state, container_id, adb_port, stream_url, expires_at
from sessions order by started_at desc limit 1;
```

A healthy real session shows a `container_id`, an `adb_port`, a populated
`stream_url`, and `expires_at = null` (unlimited).
