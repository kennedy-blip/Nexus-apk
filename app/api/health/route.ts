import { NextResponse } from "next/server";
import { orchestratorConfig, orchestratorHealth } from "@/lib/backend";
import { adminKey, createAdminClient, isAdminConfigured } from "@/lib/supabase/server";
import { sessionsExpire, sessionTtlSeconds } from "@/lib/session-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Table privileges, not policies, decide whether a query is allowed at all. */
function looksLikeMissingGrant(message: string): boolean {
  return /permission denied/i.test(message) || message.includes("42501");
}

/**
 * GET /api/health — control-plane readiness probe.
 * Reports which subsystems are wired without leaking any secret values.
 */
export async function GET() {
  const config = orchestratorConfig();
  const orchestrator = config.configured
    ? await orchestratorHealth()
    : {
        ok: false,
        detail:
          "NEXUS_BACKEND_URL/NEXUS_BACKEND_TOKEN are unset — sessions run the canvas simulator and your APK does not execute. See docs/REAL_DEVICES.md",
      };

  const supabaseReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  // Probe the database itself rather than trusting that the env vars are set.
  // A project can have every policy in place and still reject every query with
  // `42501 permission denied`, which otherwise looks like an empty account.
  let database: "ready" | "error" | "unconfigured" = "unconfigured";
  let databaseDetail: string | null = null;

  if (isAdminConfigured()) {
    try {
      const admin = createAdminClient();
      const { error } = await admin.from("apks").select("id").limit(1);
      if (error) {
        database = "error";
        databaseDetail = looksLikeMissingGrant(error.message)
          ? `${error.code ?? "42501"}: table privileges missing — apply supabase/migrations/0002_nexusapk_grants.sql`
          : `${error.code ?? "error"}: ${error.message}`;
      } else {
        database = "ready";
      }
    } catch (cause) {
      database = "error";
      databaseDetail = cause instanceof Error ? cause.message : "database probe failed";
    }
  }

  const healthy = supabaseReady && database !== "error";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      services: {
        supabase: supabaseReady ? "ready" : "unconfigured",
        database,
        databaseDetail,
        storage: process.env.NEXUS_APK_BUCKET ?? "apks",
        privilegedKey: adminKey() ? (adminKey()!.startsWith("sb_secret_") ? "publishable+secret" : "service_role-jwt") : "missing",
        sessionLease: sessionsExpire() ? `${sessionTtlSeconds()}s` : "unlimited",
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
