import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDuration, formatRelativeTime } from "@/lib/utils";
import type { ApkRecord, SessionRecord } from "@/lib/types";

export const metadata: Metadata = { title: "Sessions" };
export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const supabase = await createClient();

  const [{ data: sessions }, { data: apks }] = await Promise.all([
    supabase
      .from("sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50),
    supabase.from("apks").select("id, display_name"),
  ]);

  const names = new Map(
    ((apks ?? []) as Pick<ApkRecord, "id" | "display_name">[]).map((a) => [
      a.id,
      a.display_name,
    ]),
  );

  const rows = (sessions ?? []) as SessionRecord[];
  const live = rows.filter((r) => r.state === "running").length;
  const totalMinutes = rows.reduce((sum, r) => {
    const end = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
    return sum + Math.max(0, (end - new Date(r.started_at).getTime()) / 60000);
  }, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">Sessions</h1>
        <p className="mt-1 text-[13.5px] text-zinc-500">
          {live} live · {rows.length} total · {Math.round(totalMinutes)} minutes of
          compute used
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="glass-subtle rounded-3xl px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-zinc-300">No sessions yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-zinc-500">
            Launch an app from the library and it will show up here with its full
            teardown history.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12.5px] text-white transition-colors hover:bg-white/[0.1]"
          >
            Go to library
          </Link>
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-white/[0.07] text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
                <th className="px-4 py-2.5 font-medium">App</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Device</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Started</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const ended = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
                const mins = Math.max(0, (ended - new Date(s.started_at).getTime()) / 1000);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.025]"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-200">
                        {names.get(s.apk_id) ?? "Deleted app"}
                      </p>
                      <p className="font-mono text-[10.5px] text-zinc-600">
                        {s.id.slice(0, 8)}
                        {s.simulated ? " · simulator" : s.adb_port ? ` · adb :${s.adb_port}` : ""}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-400 sm:table-cell">
                      {s.device_profile}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill state={s.state} pulse={false} />
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-500 md:table-cell">
                      {formatRelativeTime(s.started_at)} · {formatDuration(mins)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/playground/${s.id}`}
                        className="text-[12px] text-indigo-300 transition-colors hover:text-cyan-300"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
