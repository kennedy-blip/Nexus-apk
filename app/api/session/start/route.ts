import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  orchestratorConfig,
  startRemoteSession,
  OrchestratorError,
} from "@/lib/backend";
import { DEVICE_PROFILES, type DeviceProfile, type SessionRecord } from "@/lib/types";

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

  // Recycle a live session for this APK instead of stacking containers.
  const { data: existing } = await supabase
    .from("sessions")
    .select("*")
    .eq("apk_id", apk.id)
    .in("state", ["pending", "provisioning", "installing", "running"])
    .gte("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ session: existing as SessionRecord, reused: true });
  }

  const ttlSeconds = Number(process.env.NEXUS_SESSION_TTL_SECONDS ?? 900);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

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
    .createSignedUrl(apk.storage_path, ttlSeconds + 300);

  const config = orchestratorConfig();
  const shouldSimulate = body.simulate === true || !config.configured;

  if (shouldSimulate) {
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
      ttl_seconds: ttlSeconds,
    });

    const { data: updated } = await supabase
      .from("sessions")
      .update({
        state: remote.state ?? "running",
        backend_session_id: remote.session_id,
        container_id: remote.container_id ?? null,
        adb_port: remote.adb_port ?? null,
        stream_url: remote.stream_url ?? null,
        ws_url: remote.ws_url ?? null,
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
