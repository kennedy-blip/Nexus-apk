import { NextResponse } from "next/server";
import { orchestratorConfig, orchestratorHealth } from "@/lib/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — control-plane readiness probe.
 * Reports which subsystems are wired without leaking any secret values.
 */
export async function GET() {
  const config = orchestratorConfig();
  const orchestrator = config.configured
    ? await orchestratorHealth()
    : { ok: false, detail: "not configured" };

  const supabaseReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const healthy = supabaseReady;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      services: {
        supabase: supabaseReady ? "ready" : "unconfigured",
        storage: process.env.NEXUS_APK_BUCKET ?? "apks",
        orchestrator: orchestrator.ok ? "ready" : "unavailable",
        orchestratorDetail: orchestrator.detail ?? null,
        containers: orchestrator.containers ?? null,
      },
      mode: config.configured ? "cloud" : "simulator",
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
