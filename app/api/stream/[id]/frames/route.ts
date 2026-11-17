import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { orchestratorConfig } from "@/lib/backend";
import type { SessionRecord } from "@/lib/types";

export const runtime = "nodejs";
// MJPEG is a long-lived response; keep the function alive as long as allowed.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/stream/:id/frames
 *
 * Same-origin MJPEG proxy. The browser renders this in an <img>, the route
 * authorises the viewer through the Supabase session cookie, then pipes the
 * orchestrator's multipart stream through with the bearer token attached — so
 * the private backend is never exposed to the client.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS-constrained lookup: users can only stream their own sessions.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, state, simulated, stream_url")
    .eq("id", id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const record = session as Pick<SessionRecord, "id" | "state" | "simulated" | "stream_url">;
  if (record.simulated || !record.stream_url) {
    return NextResponse.json(
      { error: "Session has no container stream; use the simulator" },
      { status: 409 },
    );
  }

  const config = orchestratorConfig();
  if (!config.configured || !config.baseUrl) {
    return NextResponse.json({ error: "Orchestrator unavailable" }, { status: 503 });
  }

  const { issueStreamToken } = await import("@/lib/stream-token");
  const token = issueStreamToken(id);

  const upstream = await fetch(
    `${config.baseUrl}/api/stream/${id}/mjpeg${token ? `?token=${token}` : ""}`,
    {
      headers: {
        authorization: `Bearer ${config.token ?? ""}`,
        accept: "multipart/x-mixed-replace",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(maxDuration * 1000),
    },
  ).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Frame feed unavailable" },
      { status: upstream?.status && upstream.status >= 400 ? upstream.status : 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ??
        "multipart/x-mixed-replace; boundary=nexusframe",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
