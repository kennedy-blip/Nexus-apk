import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inspect } from "@/lib/inspect/report";
import { inspectBatch, MAX_BATCH_URLS } from "@/lib/inspect/batch";
import { BlockedTargetError } from "@/lib/inspect/url";

/**
 * POST /api/inspect — inspect one URL, or a list of up to 20.
 *
 * Runs on the Node.js runtime because the inspector uses raw sockets, DNS and
 * TLS, none of which exist on the edge runtime.
 *
 * Access model, matching the rest of the product: a signed-in account is
 * unrestricted; an anonymous visitor gets a small allowance per IP so the public
 * demo stays usable without becoming an open proxy for anyone's traffic.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ANON_LIMIT = 5;
const ANON_WINDOW_MS = 10 * 60 * 1000;

/**
 * Best-effort per-instance throttle.
 *
 * This is deliberately simple: serverless functions are ephemeral and
 * horizontally scaled, so a Map is not a real rate limiter — it only stops a
 * single warm instance being hammered. It is honest about that in the docs
 * rather than pretending to be airtight.
 *
 * The bucket key uses the *last* `x-forwarded-for` hop, not the first. Proxies
 * prepend client-supplied values, so trusting the first entry lets a caller
 * rotate a header and mint a fresh allowance on every request; the last hop is
 * the one appended by the platform's own edge. This also chunks IPv6 to its /64
 * so a single allocation cannot trivially rotate addresses.
 */
const anonUsage = new Map<string, { count: number; resetAt: number }>();

function anonIdentify(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const hops = forwarded
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = hops?.at(-1) || request.headers.get("x-real-ip")?.trim() || "unknown";

  // Collapse an IPv6 address to its /64 prefix.
  if (ip.includes(":") && !ip.includes(".")) {
    const expanded = ip.split("%")[0];
    const groups = expanded.split(":");
    return `${groups.slice(0, 4).join(":")}::/64`;
  }
  return ip;
}

function checkAnonAllowance(request: Request, cost: number): { ok: boolean; remaining: number; resetInMs: number } {
  const key = anonIdentify(request);
  const now = Date.now();
  const entry = anonUsage.get(key);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (anonUsage.size > 5000) {
    for (const [k, v] of anonUsage) if (v.resetAt < now) anonUsage.delete(k);
  }

  if (!entry || entry.resetAt < now) {
    anonUsage.set(key, { count: cost, resetAt: now + ANON_WINDOW_MS });
    return { ok: true, remaining: ANON_LIMIT - cost, resetInMs: ANON_WINDOW_MS };
  }

  // A refused request must not consume allowance, otherwise a user whose limit
  // has already reset finds themselves permanently locked out by retries.
  if (entry.count + cost > ANON_LIMIT) {
    return { ok: false, remaining: 0, resetInMs: Math.max(0, entry.resetAt - now) };
  }

  entry.count += cost;
  return { ok: true, remaining: ANON_LIMIT - entry.count, resetInMs: entry.resetAt - now };
}

export async function POST(request: Request) {
  let payload: { url?: unknown; urls?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: {\"url\": string} or {\"urls\": string[]}" }, { status: 400 });
  }

  const single = typeof payload.url === "string" ? payload.url.trim() : null;
  const list = Array.isArray(payload.urls)
    ? payload.urls.filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter(Boolean)
    : [];

  if (!single && list.length === 0) {
    return NextResponse.json({ error: "Provide \"url\" or \"urls\"" }, { status: 400 });
  }

  // --- auth ------------------------------------------------------------
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    // No Supabase configured => treat as anonymous demo.
    signedIn = false;
  }

  const batch = single ? [single] : list;
  if (batch.length > MAX_BATCH_URLS) {
    return NextResponse.json(
      { error: `At most ${MAX_BATCH_URLS} URLs per request` },
      { status: 400 },
    );
  }

  if (!signedIn) {
    const allowance = checkAnonAllowance(request, batch.length);
    if (!allowance.ok) {
      return NextResponse.json(
        {
          error: "Anonymous allowance reached. Sign in for unlimited inspections.",
          code: "rate_limited",
          resetInSeconds: Math.ceil(allowance.resetInMs / 1000),
          limit: ANON_LIMIT,
        },
        { status: 429, headers: { "retry-after": String(Math.ceil(allowance.resetInMs / 1000)) } },
      );
    }
  }

  // --- single ----------------------------------------------------------
  if (single) {
    try {
      const report = await inspect(single);
      return NextResponse.json({ report, signedIn });
    } catch (error) {
      if (error instanceof BlockedTargetError) {
        // 400 with the stated reason — never a generic "failed".
        return NextResponse.json(
          { error: error.message, code: error.reason },
          { status: 400 },
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: `Could not fetch that URL: ${message}`, code: "fetch_failed" },
        { status: 502 },
      );
    }
  }

  // --- batch -----------------------------------------------------------
  const results = await inspectBatch(batch);
  return NextResponse.json({ results, signedIn });
}
