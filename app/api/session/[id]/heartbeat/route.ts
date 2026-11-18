import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { heartbeatRemoteSession, orchestratorConfig } from "@/lib/backend";
import { expiryForTtl, sessionTtlSeconds } from "@/lib/session-policy";

export const runtime = "nodejs";

/**
 * POST /api/session/:id/heartbeat
 * Keeps an active session from being reaped. The playground fires this every
 * 60s while the tab is visible.
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
    .select("id, state, backend_session_id, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // with no lease configured expires_at stays NULL: there is no countdown to
  // extend, and writing a timestamp here would silently start one.
  const expiresAt = expiryForTtl(sessionTtlSeconds());

  if (session.backend_session_id && orchestratorConfig().configured) {
    try {
      await heartbeatRemoteSession(session.backend_session_id);
    } catch {
      /* non-fatal — the DB heartbeat still extends the lease */
    }
  }

  const patch: Record<string, string | null> = {
    last_heartbeat_at: new Date().toISOString(),
  };
  if (expiresAt !== null) patch.expires_at = expiresAt;

  const { data: updated } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", id)
    .select("id, expires_at")
    .single();

  return NextResponse.json({ ok: true, session: updated });
}
