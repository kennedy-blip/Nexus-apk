import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SessionEvent } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/session/:id/events?after=<id> — incremental console log. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);

  let query = supabase
    .from("session_events")
    .select("*")
    .eq("session_id", id)
    .order("id", { ascending: true })
    .limit(200);

  if (Number.isFinite(after) && after > 0) query = query.gt("id", after);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: (data ?? []) as SessionEvent[] });
}

/** POST /api/session/:id/events — client-side telemetry (input latency, etc). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    level?: "debug" | "info" | "warn" | "error";
  };

  if (!body.message || body.message.length > 500) {
    return NextResponse.json({ error: "message is required (max 500 chars)" }, { status: 400 });
  }

  const { error } = await supabase.from("session_events").insert({
    session_id: id,
    owner_id: user.id,
    level: body.level ?? "info",
    message: body.message,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
