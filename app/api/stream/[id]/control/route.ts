import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { orchestratorConfig } from "@/lib/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Input relay for the control channel.
 *
 * Next.js route handlers cannot accept WebSocket upgrades, so the browser
 * POSTs frames here and we forward each one to the orchestrator's input
 * endpoint with the bearer token. The playground batches frames client-side
 * (see `useDeviceStream`) to keep this to one request per gesture.
 */
export async function POST(
  request: NextRequest,
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
    .select("id, simulated, state")
    .eq("id", id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.simulated) {
    return NextResponse.json({ ok: true, ignored: "simulated" });
  }

  const config = orchestratorConfig();
  if (!config.configured || !config.baseUrl) {
    return NextResponse.json({ error: "Orchestrator unavailable" }, { status: 503 });
  }

  const body = await request.text();
  if (body.length > 4096) {
    return NextResponse.json({ error: "Frame too large" }, { status: 413 });
  }

  const { issueStreamToken } = await import("@/lib/stream-token");
  const token = issueStreamToken(id);

  const upstream = await fetch(
    `${config.baseUrl}/api/stream/${id}/input${token ? `?token=${token}` : ""}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token ?? ""}`,
        "content-type": "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    },
  ).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: "Input rejected" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
