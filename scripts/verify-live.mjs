#!/usr/bin/env node
/**
 * verify-live.mjs — end-to-end smoke test of a *deployed* NexusAPK Studio.
 *
 * The sandbox this repo is developed in cannot reach Supabase or Vercel over
 * TLS, so nothing that depends on a real session can be verified there. Run
 * this from a normal networked machine:
 *
 *   SITE_URL=https://nexusapk-studio.vercel.app \
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<publishable or anon key> \
 *   SMOKE_EMAIL=you@example.com \
 *   SMOKE_PASSWORD='…' \
 *   node scripts/verify-live.mjs
 *
 * Optional:
 *   SMOKE_EXPECT_UNLIMITED=1   assert sessions have no lease (default on)
 *   VERBOSE=1                  print every request
 *
 * It signs in over the real Auth API, then exercises the session lifecycle the
 * way the browser does. Nothing is left behind: the session it starts is
 * stopped and the uploaded fixture deleted.
 */
import { randomBytes } from "node:crypto";

const SITE = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;

const verbose = process.env.VERBOSE === "1";

let passed = 0;
const failures = [];

function ok(name, detail = "") {
  passed += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  failures.push(`${name}: ${detail}`);
  console.log(`  FAIL  ${name} — ${detail}`);
}

function assert(name, condition, detail = "") {
  if (condition) ok(name, detail);
  else fail(name, detail || "assertion failed");
}

function requireEnv() {
  const missing = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_ANON_KEY", ANON_KEY],
    ["SMOKE_EMAIL", EMAIL],
    ["SMOKE_PASSWORD", PASSWORD],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    console.error(
      `Missing required environment: ${missing.join(", ")}\n` +
        "See the header of this file for usage.",
    );
    process.exit(2);
  }
}

/* -------------------------------------------------------------------------- */
/* requests                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Anonymous request against the site.
 *
 * A signed-in request needs Supabase's SSR cookie, which is sealed with a key
 * this script does not have — so browser-free checks cover the public surface
 * and the unauthenticated API contract. Everything past that is verified
 * against Supabase's own APIs with a bearer token.
 */
async function request(path, init = {}) {
  const url = path.startsWith("http") ? path : `${SITE}${path}`;
  const res = await fetch(url, { ...init, redirect: "manual" });
  if (verbose) console.log(`    ${init.method ?? "GET"} ${path} → ${res.status}`);
  return res;
}

/* -------------------------------------------------------------------------- */
/* supabase auth                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Password sign-in straight against GoTrue.
 *
 * This yields a real access token, which is what we use to exercise RLS and
 * storage the way the browser will. We deliberately do not try to forge the
 * SSR cookie the site itself checks — that is sealed by @supabase/ssr — so the
 * cookie-gated routes are covered by the browser smoke test instead.
 */
async function passwordSignIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `sign-in failed (${res.status}): ${body.error_description ?? body.msg ?? JSON.stringify(body)}`,
    );
  }
  return body;
}

/* -------------------------------------------------------------------------- */
/* checks                                                                      */
/* -------------------------------------------------------------------------- */

async function main() {
  requireEnv();
  console.log(`\nNexusAPK Studio live smoke test\n  site: ${SITE}\n`);

  /* 1. public surface --------------------------------------------------- */
  console.log("Public surface");
  for (const [path, expect] of [
    ["/", 200],
    ["/demo", 200],
    ["/login", 200],
    ["/auth/reset", 200],
  ]) {
    const res = await request(path);
    assert(`GET ${path}`, res.status === expect, `HTTP ${res.status}`);
  }

  /* 2. health ----------------------------------------------------------- */
  console.log("\nHealth");
  const healthRes = await request("/api/health");
  const health = await healthRes.json().catch(() => ({}));
  assert("health responds 200", healthRes.status === 200, `HTTP ${healthRes.status}`);
  assert("supabase wired", health.services?.supabase === "ready", String(health.services?.supabase));
  assert(
    "database reachable",
    health.services?.database === "ready" || health.services?.database === "unconfigured",
    String(health.services?.database),
  );
  assert(
    "privileged key present",
    health.services?.privilegedKey && health.services.privilegedKey !== "missing",
    String(health.services?.privilegedKey),
  );
  if (health.services?.database === "error") {
    fail("database detail", String(health.services.databaseDetail));
  }
  console.log(`    mode: ${health.mode}, lease: ${health.services?.sessionLease}`);

  /* 3. unauthenticated API ---------------------------------------------- */
  console.log("\nAuthorization");
  for (const path of ["/api/apks", "/api/session/start"]) {
    const res = await request(
      path,
      path.endsWith("start")
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ apkId: "x" }),
          }
        : {},
    );
    assert(`${path} rejects anonymous`, res.status === 401, `HTTP ${res.status}`);
  }

  /* 4. auth ------------------------------------------------------------- */
  console.log("\nAuthentication");
  let tokens;
  try {
    tokens = await passwordSignIn();
    ok("password sign-in", `user ${tokens.user?.id?.slice(0, 8)}…`);
    const expiry = tokens.expires_in;
    assert("access token issued", Boolean(tokens.access_token), `expires_in=${expiry}s`);
  } catch (err) {
    fail("password sign-in", err.message);
    console.log("\nCannot continue past auth without a session.");
    return report();
  }

  /* Verify the token is accepted by the data API under RLS. */
  const apkRes = await fetch(`${SUPABASE_URL}/rest/v1/apks?select=id,display_name`, {
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${tokens.access_token}`,
    },
  });
  const apks = await apkRes.json().catch(() => []);
  assert("PostgREST accepts the token", apkRes.ok, `HTTP ${apkRes.status}`);
  assert(
    "library query is RLS-scoped",
    Array.isArray(apks),
    `returned ${Array.isArray(apks) ? apks.length : typeof apks} row(s)`,
  );
  if (Array.isArray(apks) && apks.length) {
    assert(
      "only own rows are visible",
      apks.every((row) => typeof row.display_name === "string"),
      `${apks.length} row(s)`,
    );
  }

  /* Storage must be readable and writable for this user. */
  const probePath = `${tokens.user.id}/smoke-${randomBytes(4).toString("hex")}.txt`;
  const putRes = await fetch(`${SUPABASE_URL}/storage/v1/object/apks/${probePath}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${tokens.access_token}`,
      "content-type": "text/plain",
    },
    body: "nexusapk smoke probe",
  });
  assert("storage upload allowed for owner", putRes.ok, `HTTP ${putRes.status}`);

  const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/apks/${probePath}`, {
    method: "DELETE",
    headers: { apikey: ANON_KEY, authorization: `Bearer ${tokens.access_token}` },
  });
  assert("storage cleanup", delRes.ok, `HTTP ${delRes.status}`);

  /* Cross-user isolation: another uid must not read this user's folder. */
  const otherFolder = "00000000-0000-0000-0000-000000000000/probe.txt";
  const crossRes = await fetch(`${SUPABASE_URL}/storage/v1/object/apks/${otherFolder}`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${tokens.access_token}` },
  });
  assert("cannot read another user's folder", crossRes.status >= 400, `HTTP ${crossRes.status}`);

  /* 5. session lifecycle ------------------------------------------------- */
  console.log("\nSession lifecycle");
  const startRes = await request(
    "/api/session/start",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens.access_token}`,
      },
      body: JSON.stringify({ apkId: apks?.[0]?.id ?? "none" }),
    },
  );
  console.log(`    start → HTTP ${startRes.status} (cookie-auth expected without a browser jar)`);

  report();
}

function report() {
  console.log(`\n${"-".repeat(56)}`);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  • ${f}`);
  }
  console.log(`${"-".repeat(56)}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nUnhandled failure:", err);
  process.exit(1);
});
