import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InspectionReport } from "@/lib/inspect/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/inspections — save a report to the signed-in user's history.
 *
 * Anonymous visitors are not persisted at all: the public demo writes nothing.
 * The report is validated for shape before insert so a malformed client payload
 * cannot poison the history view.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not an error: the demo simply doesn't persist. The client ignores this.
    return NextResponse.json({ saved: false, reason: "anonymous" }, { status: 202 });
  }

  let body: { report?: InspectionReport };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const report = body.report;
  if (!report || typeof report.finalUrl !== "string" || typeof report.input !== "string") {
    return NextResponse.json({ error: "A report with input and finalUrl is required" }, { status: 400 });
  }

  let host: string;
  try {
    host = new URL(report.finalUrl).hostname;
  } catch {
    return NextResponse.json({ error: "finalUrl is not a valid URL" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("inspections")
    .insert({
      owner_id: user.id,
      input_url: report.input.slice(0, 2048),
      final_url: report.finalUrl.slice(0, 2048),
      host,
      status_code: typeof report.status === "number" ? report.status : null,
      title: report.preview?.title?.slice(0, 500) ?? null,
      description: report.preview?.description?.slice(0, 2000) ?? null,
      report,
      duration_ms: typeof report.durationMs === "number" ? report.durationMs : null,
      payload_count: Array.isArray(report.decoded) ? report.decoded.length : 0,
    })
    .select("id")
    .single();

  if (error) {
    // Surface the real cause rather than a generic failure — missing grants and
    // RLS rejections look identical to the user otherwise.
    return NextResponse.json(
      { error: `Could not save: ${error.message}`, code: error.code },
      { status: 500 },
    );
  }

  return NextResponse.json({ saved: true, id: data.id });
}
