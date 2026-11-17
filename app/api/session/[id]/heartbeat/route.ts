import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { heartbeatRemoteSession, orchestratorConfig } from "@/lib/backend";

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

  const ttlSeconds = Number(process.env.NEXUS_SESSION_TTL_SECONDS ?? 900);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  if (session.backend_session_id && orchestratorConfig().configured) {
    try {
      await heartbeatRemoteSession(session.backend_session_id);
    } catch {
      /* non-fatal — the DB heartbeat still extends the lease */
    }
  }

  const { data: updated } = await supabase
    .from("sessions")
    .update({ last_heartbeat_at: new Date().toISOString(), expires_at: expiresAt })
    .eq("id", id)
    .select("id, expires_at")
    .single();

  return NextResponse.json({ ok: true, session: updated });
}
