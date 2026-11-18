import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LibraryView } from "@/components/dashboard/library-view";
import type { ApkRecord, SessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [apksResult, sessionsResult] = await Promise.all([
    supabase.from("apks").select("*").order("created_at", { ascending: false }),
    supabase
      .from("sessions")
      .select("*")
      .in("state", ["pending", "provisioning", "installing", "running"])
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const { data: apks, error: apksError } = apksResult;
  const { data: sessions, error: sessionsError } = sessionsResult;
  const failure = apksError ?? sessionsError;

  // Never render an empty library as "you have no APKs" when the query itself
  // failed (missing grants, RLS misconfiguration, expired session). That reads
  // like data loss and is impossible to debug from the UI.
  if (failure) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-6">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Could not load your library
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">
          The database rejected the request, so this is not an empty account.
          Reload the page; if it keeps happening the schema grants or row-level
          security policies need attention.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11.5px] text-rose-200">
          {failure.code ? `${failure.code}: ` : ""}
          {failure.message}
        </pre>
      </div>
    );
  }

  return (
    <LibraryView
      initialApks={(apks ?? []) as ApkRecord[]}
      activeSessions={(sessions ?? []) as SessionRecord[]}
    />
  );
}
