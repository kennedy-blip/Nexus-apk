import { NextResponse } from "next/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Table privileges, not policies, decide whether a query is allowed at all. */
function looksLikeMissingGrant(message: string): boolean {
  return /permission denied/i.test(message) || message.includes("42501");
}

/**
 * GET /api/health — readiness probe.
 *
 * Reports which subsystems are wired without leaking secret values. The
 * inspector needs no orchestrator or Android host: it is pure Node HTTP, DNS
 * and TLS, so there is no "degraded to simulator" state to report any more.
 */
export async function GET() {
  const supabaseReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  // Probe the database itself rather than trusting that env vars are set. A
  // project can have every policy in place and still reject every query with
  // `42501 permission denied`, which otherwise looks like an empty account.
  let database: "ready" | "error" | "unconfigured" = "unconfigured";
  let databaseDetail: string | null = null;

  if (isAdminConfigured()) {
    try {
      // `inspections` is written on every signed-in inspection.
      const admin = createAdminClient();
      const { error } = await admin.from("inspections").select("id").limit(1);

      if (!error) {
        database = "ready";
      } else if (looksLikeMissingGrant(error.message)) {
        database = "error";
        databaseDetail = `grants missing — apply supabase/migrations (${error.message})`;
      } else if (/does not exist|schema cache/i.test(error.message)) {
        database = "error";
        databaseDetail = `table missing — apply supabase/migrations (${error.message})`;
      } else {
        database = "error";
        databaseDetail = error.message;
      }
    } catch (error) {
      database = "error";
      databaseDetail = error instanceof Error ? error.message : String(error);
    }
  }

  const status =
    database === "error" ? "degraded" : supabaseReady ? "ok" : "unconfigured";

  return NextResponse.json(
    {
      status,
      product: "NexusScope",
      services: {
        supabase: supabaseReady ? "ready" : "unconfigured",
        database,
        databaseDetail,
        privilegedKey: isAdminConfigured() ? "configured" : "missing",
        inspector: "ready",
      },
      /** Named so a reader knows the anonymous allowance is intentional. */
      limits: {
        anonymousInspectionsPerWindow: 5,
        windowMinutes: 10,
        signedIn: "unlimited",
      },
      timestamp: new Date().toISOString(),
    },
    { status: status === "degraded" ? 503 : 200 },
  );
}
