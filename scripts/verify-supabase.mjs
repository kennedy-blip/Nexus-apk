#!/usr/bin/env node
/**
 * Live smoke test for the Supabase side of NexusAPK Studio.
 *
 * Exercises exactly what the app does: private bucket, object upload, signed
 * URL, apks/sessions/session_events writes, the profiles trigger, the
 * updated_at trigger, RLS isolation and cascade deletes. Everything it creates
 * is removed again at the end.
 *
 * Usage (service role key never leaves your machine):
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   SEED_USER_ID=<uuid of an existing auth.users row> \
 *   node scripts/verify-supabase.mjs
 */

const URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const USER_ID = process.env.SEED_USER_ID;

if (!URL || !SECRET || !ANON || !USER_ID) {
  console.error(
    "Missing env. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SEED_USER_ID",
  );
  process.exit(2);
}

const auth = { apikey: SECRET, authorization: `Bearer ${SECRET}` };
let failures = 0;

async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
    return detail;
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${name} — ${err.message}`);
    return undefined;
  }
}

async function json(res) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const bucket = process.env.SUPABASE_BUCKET ?? "apks";
const objectId = crypto.randomUUID();
const storagePath = `${USER_ID}/${objectId}/verify.apk`;
const payload = new Uint8Array(2048);
payload.set([0x50, 0x4b, 0x03, 0x04]); // zip magic, like a real APK
let apkId;
let sessionId;

console.log(`\nVerifying ${URL}\n${"-".repeat(60)}`);

await step("bucket exists and is private", async () => {
  const b = await json(await fetch(`${URL}/storage/v1/bucket/${bucket}`, { headers: auth }));
  if (b.public) throw new Error("bucket is public");
  return `size limit ${b.file_size_limit}`;
});

await step("storage upload", async () => {
  await json(
    await fetch(`${URL}/storage/v1/object/${bucket}/${storagePath}`, {
      method: "POST",
      headers: {
        ...auth,
        "content-type": "application/vnd.android.package-archive",
        "x-upsert": "false",
      },
      body: payload,
    }),
  );
  return storagePath;
});

await step("insert apks row", async () => {
  const rows = await json(
    await fetch(`${URL}/rest/v1/apks`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({
        owner_id: USER_ID,
        display_name: "Verify App",
        package_name: "com.verify.app",
        version_name: "1.0.0",
        version_code: 10000,
        min_sdk: 26,
        target_sdk: 34,
        size_bytes: payload.length,
        sha256: "0".repeat(64),
        storage_path: storagePath,
        status: "ready",
      }),
    }),
  );
  apkId = rows[0].id;
  return apkId;
});

await step("signed URL round-trip", async () => {
  const { signedURL } = await json(
    await fetch(`${URL}/storage/v1/object/sign/${bucket}/${storagePath}`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 600 }),
    }),
  );
  const res = await fetch(`${URL}/storage/v1${signedURL}`);
  if (!res.ok) throw new Error(`download ${res.status}`);
  return `${(await res.arrayBuffer()).byteLength} bytes`;
});

await step("insert sessions row", async () => {
  const rows = await json(
    await fetch(`${URL}/rest/v1/sessions`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({
        apk_id: apkId,
        owner_id: USER_ID,
        state: "running",
        device_profile: "phone",
        simulated: true,
      }),
    }),
  );
  sessionId = rows[0].id;
  if (!rows[0].expires_at) throw new Error("expires_at default missing");
  return rows[0].expires_at;
});

await step("insert session_events", async () => {
  const rows = await json(
    await fetch(`${URL}/rest/v1/session_events`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify([
        { session_id: sessionId, owner_id: USER_ID, level: "info", message: "verify ping" },
        { session_id: sessionId, owner_id: USER_ID, level: "warn", message: "verify warn" },
      ]),
    }),
  );
  return `${rows.length} rows`;
});

await step("profiles trigger populated", async () => {
  const rows = await json(
    await fetch(`${URL}/rest/v1/profiles?id=eq.${USER_ID}&select=email,plan`, { headers: auth }),
  );
  if (!rows.length) throw new Error("no profile row");
  return `${rows[0].email} (${rows[0].plan})`;
});

await step("RLS blocks anon reads", async () => {
  const rows = await json(
    await fetch(`${URL}/rest/v1/sessions?select=id`, {
      headers: { apikey: ANON, authorization: `Bearer ${ANON}` },
    }),
  );
  if (rows.length > 0) throw new Error(`anon leaked ${rows.length} row(s)`);
  return "anon sees 0 rows";
});

await step("updated_at trigger", async () => {
  const before = await json(
    await fetch(`${URL}/rest/v1/apks?id=eq.${apkId}&select=updated_at`, { headers: auth }),
  );
  await new Promise((r) => setTimeout(r, 1100));
  const after = await json(
    await fetch(`${URL}/rest/v1/apks?id=eq.${apkId}`, {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ launch_count: 1 }),
    }),
  );
  if (new Date(after[0].updated_at) <= new Date(before[0].updated_at)) {
    throw new Error("timestamp did not advance");
  }
  return "advanced";
});

await step("cascade delete", async () => {
  await json(await fetch(`${URL}/rest/v1/sessions?id=eq.${sessionId}`, { method: "DELETE", headers: auth }));
  const orphans = await json(
    await fetch(`${URL}/rest/v1/session_events?session_id=eq.${sessionId}&select=id`, { headers: auth }),
  );
  if (orphans.length) throw new Error(`${orphans.length} orphan event(s)`);
  return "session_events cascaded";
});

await step("cleanup", async () => {
  await fetch(`${URL}/rest/v1/apks?id=eq.${apkId}`, { method: "DELETE", headers: auth });
  await fetch(`${URL}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ prefixes: [storagePath] }),
  });
  return "verify rows + object removed";
});

console.log("-".repeat(60));
console.log(failures === 0 ? "All checks passed.\n" : `${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
