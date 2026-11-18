import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { HistoryView } from "@/components/dashboard/history-view";
import type { InspectionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  // No `.limit()`: a signed-in account has unlimited history, so the page shows
  // everything it has rather than silently truncating.
  const { data, error } = await supabase
    .from("inspections")
    .select("id, owner_id, input_url, final_url, host, status_code, title, description, duration_ms, payload_count, note, created_at")
    .order("created_at", { ascending: false });

  // Never render an empty history as "you have nothing" when the query itself
  // failed (missing grants, RLS misconfiguration). That reads like data loss and
  // is impossible to debug from the UI.
  if (error) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-6">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Could not load your history
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">
          The database rejected the request, so this is not an empty account. Reload the page;
          if it keeps happening, apply <code className="font-mono text-[11.5px]">supabase/migrations</code>{" "}
          so the table and its grants exist.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11.5px] text-rose-200">
          {error.code ? `${error.code}: ` : ""}
          {error.message}
        </pre>
      </div>
    );
  }

  return <HistoryView initial={(data ?? []) as InspectionRecord[]} />;
}
