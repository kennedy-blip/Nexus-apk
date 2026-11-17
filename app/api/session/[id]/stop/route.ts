import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { orchestratorConfig, stopRemoteSession } from "@/lib/backend";
import type { SessionRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * POST /api/session/:id/stop — tears down the container and closes the row.
 * Idempotent: stopping a stopped session returns the row unchanged.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const record = session as SessionRecord;

  if (record.state === "stopped" || record.state === "failed") {
    return NextResponse.json({ session: record, alreadyStopped: true });
  }

  await supabase.from("sessions").update({ state: "stopping" }).eq("id", id);

  let teardownWarning: string | null = null;

  if (record.backend_session_id && orchestratorConfig().configured) {
    try {
      await stopRemoteSession(record.backend_session_id);
    } catch (err) {
      teardownWarning =
        err instanceof Error ? err.message : "Orchestrator teardown failed";
    }
  }

  const { data: updated } = await supabase
    .from("sessions")
    .update({
      state: "stopped",
      ended_at: new Date().toISOString(),
      error_message: teardownWarning,
    })
    .eq("id", id)
    .select("*")
    .single();

  await supabase
    .from("session_events")
    .insert({
      session_id: id,
      owner_id: user.id,
      level: teardownWarning ? "warn" : "info",
      message: teardownWarning
        ? `Session closed with warning: ${teardownWarning}`
        : "Session closed and container purged.",
    })
    .then(() => undefined, () => undefined);

  return NextResponse.json({ session: updated as SessionRecord });
}
