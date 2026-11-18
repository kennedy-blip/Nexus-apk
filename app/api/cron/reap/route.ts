import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/server";
import { orchestratorConfig, stopRemoteSession } from "@/lib/backend";
import { SESSION_IDLE_GRACE_SECONDS } from "@/lib/session-policy";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/reap
 *
 * Reaps sessions that have genuinely expired: stops the redroid container,
 * marks the row stopped and logs the teardown. Meant to be hit by a scheduler
 * (Vercel Cron, GitHub Actions, or the FastAPI worker's own loop).
 *
 * Signed-in sessions normally have no lease (expires_at IS NULL) and are never
 * touched. The one exception is abandonment: a *real* container with no
 * heartbeat for SESSION_IDLE_GRACE_SECONDS is reaped so a closed tab cannot pin
 * a device forever. Simulated sessions cost nothing and are left alone.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (or `x-vercel-cron` when deployed
 * on Vercel). Refuses to run unauthenticated in production.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;

  if (secret && auth !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!secret && process.env.NODE_ENV === "production" && !isVercelCron) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Service role key required to reap sessions" },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const idleCutoff = new Date(
    Date.now() - SESSION_IDLE_GRACE_SECONDS * 1000,
  ).toISOString();

  const { data: stale, error } = await supabase
    .from("sessions")
    .select("id, owner_id, backend_session_id, state, expires_at, simulated")
    .in("state", ["pending", "provisioning", "installing", "running"])
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Lease-free sessions are only reaped when they are a real container that
  // stopped sending heartbeats, never on a wall-clock timer.
  const { data: abandoned } = await supabase
    .from("sessions")
    .select("id, owner_id, backend_session_id, state, expires_at, simulated")
    .in("state", ["pending", "provisioning", "installing", "running"])
    .is("expires_at", null)
    .eq("simulated", false)
    .lt("last_heartbeat_at", idleCutoff)
    .limit(50);

  const all = (stale ?? []).concat(abandoned ?? []);

  const results: Array<{ id: string; stopped: boolean; detail?: string }> = [];

  for (const session of all) {
    let detail: string | undefined;
    let stopped = true;

    if (session.backend_session_id && orchestratorConfig().configured) {
      try {
        await stopRemoteSession(session.backend_session_id);
      } catch (err) {
        stopped = false;
        detail = err instanceof Error ? err.message : "stop failed";
      }
    }

    await supabase
      .from("sessions")
      .update({
        state: stopped ? "stopped" : "failed",
        ended_at: nowIso,
        error_message: detail ?? null,
      })
      .eq("id", session.id);

    const reason =
      session.expires_at === null
        ? "Abandoned (no heartbeat) — device reclaimed."
        : "Lease expired — container reaped automatically.";

    await supabase.from("session_events").insert({
      session_id: session.id,
      owner_id: session.owner_id,
      level: stopped ? "info" : "warn",
      message: stopped ? reason : `Reap requested but teardown failed: ${detail}`,
    });

    results.push({ id: session.id, stopped, detail });
  }

  return NextResponse.json({
    ok: true,
    scanned: all.length,
    reaped: results.filter((r) => r.stopped).length,
    results,
    at: nowIso,
  });
}
