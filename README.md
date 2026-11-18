# NexusScope

**Paste any public URL and see everything it says.**

A link & site inspector: preview metadata, the full redirect chain, DNS, the TLS
certificate, security headers, robots.txt, technology fingerprint, outbound
destinations — and every encoded payload decoded back into readable text.

Live at **https://nexusapk-studio.vercel.app** (the domain still carries the old
project name; the product is NexusScope).

---

## What it does

| Section | What you get |
| --- | --- |
| **Preview** | Title, description, OpenGraph/Twitter image, canonical URL, site name, language, theme colour, author, publish time, keywords, accounts/profiles |
| **Audit** | Every redirect hop with status and timing, resolved addresses, TLS issuer/validity/SANs, A/AAAA/CNAME/MX/NS/TXT/CAA records, 7 security headers, robots.txt verdict with the matching rule, technology fingerprint, cookies |
| **Decoded** | Base64 blobs, hex runs, JWT claim sections, data-URI contents and HTML entities turned back into text |
| **Raw** | Response headers, every meta tag, JSON-LD, document statistics |

Each report also carries a traffic-light **signals** strip (HTTPS, certificate
expiry, missing HSTS/CSP/nosniff, `robots.txt` disallow, login wall,
JavaScript-rendered shell) and a **notes** list stating what could not be read.

Reports export as JSON.

## Access model

- **Anonymous** — 5 inspections per 10 minutes per client, nothing persisted.
  The public demo writes nothing.
- **Signed in** — unlimited inspections, unlimited permanent history, batch of
  20 URLs per request. No lease, no countdown, no expiry. Deleting your account
  removes every saved report.

## What it deliberately does not do

NexusScope reads what any anonymous visitor already receives. It does **not**:

- log in, hold cookies for private accounts, or read follower-only content;
- execute JavaScript, so script-injected content is absent (a warning is shown);
- break encryption. "Decoded" means decoding published payloads — base64, hex,
  JWT claim sections, entities. JWT signatures are reported as **unverified**;
- invent a value when a field is missing. Every gap is stated in `notes`.

## Security

The inspector fetches URLs a user typed, which makes it an SSRF sink by
construction. The guard is in `lib/inspect/url.ts` and `lib/inspect/fetch.ts`:

1. **Scheme allow-list** — only `http:`/`https:`. `file:`, `data:`, `javascript:`,
   `gopher:`, `ftp:` are refused before any resolution.
2. **Address inspection, not name inspection** — the hostname is resolved and
   every returned address is checked. Blocked: loopback, `10/8`, `172.16/12`,
   `192.168/16`, `169.254/16` (cloud metadata), CGNAT, multicast, reserved, plus
   IPv6 loopback/unique-local/link-local and IPv4-mapped forms such as
   `::ffff:127.0.0.1`.
3. **Every redirect hop is re-validated** — redirects are followed manually, one
   at a time, so a public host cannot bounce the fetcher into private space.
4. **Address pinning** — the socket connects to the address that was already
   approved, closing the DNS-rebinding window between check and connect.
5. **Decompression ceiling** — the 3 MB cap applies to the *decompressed* body.
   Capping compressed bytes lets a small gzip payload expand to gigabytes; the
   npm registry alone returns 31 MB of JSON from a ~1 MB payload.
6. **Rate-limit key** — the *last* `x-forwarded-for` hop is used (a proxy appends
   it; a client can prepend unlimited fakes), and IPv6 is collapsed to `/64`.

`npm run verify:inspect` asserts 61 properties across all of the above.

## Architecture

```
app/
  page.tsx                 landing
  inspect/page.tsx         inspector (public + signed in)
  dashboard/               saved history, settings
  api/inspect/route.ts     POST — single or batch, auth-aware rate limit
  api/inspections/         POST save, DELETE one
  api/health/route.ts      readiness probe
lib/inspect/
  url.ts                   SSRF guards, URL normalisation
  fetch.ts                 manual-redirect HTTP client, pinned + capped
  extract.ts               metadata / links / JSON-LD extraction
  decode.ts                base64, hex, JWT, data-URI, entities
  infra.ts                 DNS, TLS, robots.txt, tech detection
  report.ts                pipeline + report model + signals
  batch.ts                 bounded-concurrency batch
components/inspect/        form, workspace, report view
supabase/migrations/       schema, grants, RLS
scripts/verify-inspect.mjs security assertions
```

Next.js 16 (App Router, Node runtime) · Supabase (auth + Postgres with RLS) ·
Tailwind v4 · deployed on Vercel.

### Database

Apply `supabase/migrations/0004_nexusscope_inspections.sql`. It creates
`inspections`, grants the privileges PostgREST needs, enables RLS with
owner-only policies, and drops the retired APK/session tables.

Both grants and RLS are required: RLS decides which *rows* a role may touch, but
a role still needs the table privilege first. Missing grants produce
`42501 permission denied`, which looks like an empty account — `/api/health`
distinguishes the two.

## Local development

```bash
npm install
cp .env.example .env.local     # add your Supabase keys
npm run dev                    # http://localhost:3000
npm run typecheck
npm run lint
npm run verify:inspect
```

Without Supabase credentials the app still runs: the inspector works, the
history page redirects to sign-in, and `/api/health` reports `unconfigured`.

## History

This project began as an APK streaming workspace. Real APK execution needs a
Linux host with `binderfs`, which Vercel cannot provide — so the playground was
a canvas mock that the UI wrongly presented as live. That is why the product
pivoted to URL inspection, which runs entirely inside a serverless function, and
why every report here states its own gaps instead of filling them in.
