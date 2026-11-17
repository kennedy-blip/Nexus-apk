import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/server";
import { orchestratorConfig, stopRemoteSession } from "@/lib/backend";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/reap
 *
 * Reaps every session past its lease: stops the redroid container, marks the
 * row stopped and logs the teardown. Meant to be hit by a scheduler (Vercel
 * Cron, GitHub Actions, or the FastAPI worker's own loop).
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

  const { data: stale, error } = await supabase
    .from("sessions")
    .select("id, owner_id, backend_session_id, state")
    .in("state", ["pending", "provisioning", "installing", "running"])
    .lt("expires_at", nowIso)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; stopped: boolean; detail?: string }> = [];

  for (const session of stale ?? []) {
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

    await supabase.from("session_events").insert({
      session_id: session.id,
      owner_id: session.owner_id,
      level: stopped ? "info" : "warn",
      message: stopped
        ? "Lease expired — container reaped automatically."
        : `Lease expired but teardown failed: ${detail}`,
    });

    results.push({ id: session.id, stopped, detail });
  }

  return NextResponse.json({
    ok: true,
    scanned: stale?.length ?? 0,
    reaped: results.filter((r) => r.stopped).length,
    results,
    at: nowIso,
  });
}
