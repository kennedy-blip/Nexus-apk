import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRemoteSession, orchestratorConfig } from "@/lib/backend";
import type { SessionRecord } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/session/:id — polled by the playground every few seconds.
 * Also proxies liveness to the orchestrator so a dead container is reflected
 * in the UI without waiting for the reaper.
 */
export async function GET(
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

  if (
    record.backend_session_id &&
    orchestratorConfig().configured &&
    ["provisioning", "installing", "running"].includes(record.state)
  ) {
    try {
      const remote = await getRemoteSession(record.backend_session_id);
      if (remote.state && remote.state !== record.state) {
        const { data: updated } = await supabase
          .from("sessions")
          .update({
            state: remote.state,
            stream_url: remote.stream_url ?? record.stream_url,
            ws_url: remote.ws_url ?? record.ws_url,
            last_heartbeat_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select("*")
          .single();
        if (updated) return NextResponse.json({ session: updated });
      }
    } catch {
      /* orchestrator hiccup — serve the last known state */
    }
  }

  return NextResponse.json({ session: record });
}
