import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  orchestratorConfig,
  startRemoteSession,
  OrchestratorError,
} from "@/lib/backend";
import { DEVICE_PROFILES, type DeviceProfile, type SessionRecord } from "@/lib/types";
import { buildStreamUrls } from "@/lib/stream-token";
import {
  DEMO_SESSION_TTL_SECONDS,
  expiryForTtl,
  sessionTtlSeconds,
} from "@/lib/session-policy";

export const runtime = "nodejs";
export const maxDuration = 60;

interface StartBody {
  apkId: string;
  deviceProfile?: DeviceProfile;
  simulate?: boolean;
}

/**
 * POST /api/session/start
 *
 * 1. authorises the APK against RLS
 * 2. creates a `pending` session row (so the UI can render immediately)
 * 3. mints a signed download URL for the APK
 * 4. asks FastAPI to boot a dedicated redroid container
 * 5. persists the streaming endpoints, falling back to the browser simulator
 *    when no orchestrator is configured (local / demo deployments)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: StartBody;
  try {
    body = (await request.json()) as StartBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.apkId) {
    return NextResponse.json({ error: "apkId is required" }, { status: 400 });
  }

  const deviceProfile: DeviceProfile =
    body.deviceProfile && body.deviceProfile in DEVICE_PROFILES
      ? body.deviceProfile
      : "phone";

  const { data: apk, error: apkError } = await supabase
    .from("apks")
    .select("*")
    .eq("id", body.apkId)
    .maybeSingle();

  if (apkError) {
    return NextResponse.json({ error: apkError.message }, { status: 500 });
  }
  if (!apk) return NextResponse.json({ error: "APK not found" }, { status: 404 });

  // Recycle a live session for this APK instead of stacking containers. A NULL
  // expires_at means "no lease" and is just as live as a future timestamp.
  //
  // The null-or-future test is done here rather than in PostgREST's `or()`:
  // an ISO timestamp contains the dots and colons that filter syntax treats as
  // separators, so pushing it into the query is needlessly fragile.
  const { data: candidates } = await supabase
    .from("sessions")
    .select("*")
    .eq("apk_id", apk.id)
    .in("state", ["pending", "provisioning", "installing", "running"])
    .order("started_at", { ascending: false })
    .limit(10);

  const nowMs = Date.now();
  const existing = (candidates ?? []).find(
    (row) => !row.expires_at || new Date(row.expires_at).getTime() > nowMs,
  );

  if (existing) {
    return NextResponse.json({ session: existing as SessionRecord, reused: true });
  }

  // Signed-in accounts are unrestricted: no lease unless an operator opted in.
  //
  // "Simulated" is NOT the same as "demo". A signed-in user with no orchestrator
  // configured still gets the canvas simulator, but that is a product fallback,
  // not a limited tour — so it must not inherit the demo's 15 minute lease.
  // Only an explicit `simulate: true` (the /demo path) is bounded.
  const configuredTtl = sessionTtlSeconds();
  const wantsSimulator = body.simulate === true || !orchestratorConfig().configured;
  const isDemoTour = body.simulate === true;
  const ttlSeconds = isDemoTour
    ? DEMO_SESSION_TTL_SECONDS
    : configuredTtl;
  const expiresAt = expiryForTtl(ttlSeconds);

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      apk_id: apk.id,
      owner_id: user.id,
      state: "pending",
      device_profile: deviceProfile,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: "Could not create session", detail: sessionError?.message },
      { status: 500 },
    );
  }

  const log = async (
    level: "info" | "warn" | "error",
    message: string,
  ) => {
    await supabase
      .from("session_events")
      .insert({ session_id: session.id, owner_id: user.id, level, message })
      .then(() => undefined, () => undefined);
  };

  await log("info", `Session requested · ${apk.display_name}`);

  const bucket = process.env.NEXUS_APK_BUCKET ?? "apks";
  const { data: signed } = await supabase.storage
    .from(bucket)
    // A signed URL is only needed long enough for the container to pull the
    // APK, so cap it: indefinite sessions must not mint indefinite URLs.
    .createSignedUrl(apk.storage_path, Math.min(ttlSeconds ?? 3600, 3600));

  if (wantsSimulator) {
    await log(
      "warn",
      "No orchestrator configured — launching the interactive browser simulator.",
    );
    const { data: updated } = await supabase
      .from("sessions")
      .update({
        state: "running",
        simulated: true,
        stream_url: null,
        ws_url: null,
        backend_session_id: null,
      })
      .eq("id", session.id)
      .select("*")
      .single();

    await supabase
      .from("apks")
      .update({
        launch_count: (apk.launch_count ?? 0) + 1,
        last_launched_at: new Date().toISOString(),
      })
      .eq("id", apk.id);

    return NextResponse.json({
      session: (updated ?? session) as SessionRecord,
      simulated: true,
    });
  }

  if (!signed?.signedUrl) {
    await supabase
      .from("sessions")
      .update({ state: "failed", error_message: "APK download URL unavailable" })
      .eq("id", session.id);
    return NextResponse.json(
      { error: "Could not sign APK download URL" },
      { status: 500 },
    );
  }

  await supabase.from("sessions").update({ state: "provisioning" }).eq("id", session.id);
  await log("info", "Handing off to container orchestrator");

  try {
    const remote = await startRemoteSession({
      session_id: session.id,
      apk_url: signed.signedUrl,
      apk_filename: apk.storage_path.split("/").pop() ?? "app.apk",
      package_name: apk.package_name,
      device_profile: deviceProfile,
      // The worker's request model requires a concrete lease (<= 86400s). For an
      // unbounded session send the full-day ceiling so its watchdog never kills
      // a live container mid-use; the web layer still stores expires_at = null.
      ttl_seconds: ttlSeconds ?? 86_400,
    });

    // Swap the raw backend endpoints for browser-safe ones (same-origin proxy
    // by default, signed public URLs when explicitly configured).
    const browserUrls = buildStreamUrls(
      session.id,
      remote.stream_url ?? null,
      remote.ws_url ?? null,
    );

    const { data: updated } = await supabase
      .from("sessions")
      .update({
        state: remote.state ?? "running",
        backend_session_id: remote.session_id,
        container_id: remote.container_id ?? null,
        adb_port: remote.adb_port ?? null,
        stream_url: browserUrls.streamUrl,
        ws_url: browserUrls.wsUrl,
      })
      .eq("id", session.id)
      .select("*")
      .single();

    await supabase
      .from("apks")
      .update({
        launch_count: (apk.launch_count ?? 0) + 1,
        last_launched_at: new Date().toISOString(),
      })
      .eq("id", apk.id);

    await log("info", `Container ${remote.container_id ?? "pending"} bound on ADB :${remote.adb_port ?? "?"}`);

    return NextResponse.json({ session: updated as SessionRecord });
  } catch (err) {
    const detail =
      err instanceof OrchestratorError ? err.message : "Orchestrator failure";

    await supabase
      .from("sessions")
      .update({ state: "failed", error_message: detail })
      .eq("id", session.id);
    await log("error", `Provisioning failed: ${detail}`);

    return NextResponse.json(
      { error: "Failed to provision device", detail, sessionId: session.id },
      { status: 502 },
    );
  }
}
