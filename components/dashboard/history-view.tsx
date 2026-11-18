"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Binary, ExternalLink, Search, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { InspectionRecord } from "@/lib/types";

export function HistoryView({ initial }: { initial: InspectionRecord[] }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (row) =>
        row.host.toLowerCase().includes(term) ||
        (row.title ?? "").toLowerCase().includes(term) ||
        row.input_url.toLowerCase().includes(term),
    );
  }, [query, rows]);

  const remove = async (id: string) => {
    setRemoving(id);
    setError("");
    try {
      const response = await fetch(`/api/inspections/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? `Delete failed (${response.status})`);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight text-white">History</h1>
          <p className="mt-0.5 text-[13px] text-zinc-400">
            {rows.length === 0
              ? "Nothing inspected yet."
              : `${rows.length} saved inspection${rows.length === 1 ? "" : "s"} — kept indefinitely.`}
          </p>
        </div>
        <Link href="/inspect">
          <Button size="sm">
            New inspection
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {rows.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by host or title"
            aria-label="Filter inspections"
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 text-[13.5px] text-white placeholder:text-zinc-500 focus:border-indigo-400/40 focus:outline-none"
          />
        </div>
      )}

      {error && (
        <GlassCard className="border-rose-400/25 bg-rose-500/[0.06] p-3">
          <p className="flex items-center gap-2 text-[12.5px] text-rose-100">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </p>
        </GlassCard>
      )}

      {filtered.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <Search className="mx-auto h-5 w-5 text-zinc-600" />
          <p className="mt-2.5 text-[13.5px] text-zinc-300">
            {rows.length === 0 ? "No inspections yet" : "No matches"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-zinc-500">
            {rows.length === 0
              ? "Inspect a URL and it will be saved here automatically, with the full report — unlimited and with no expiry."
              : "Try a different host or title fragment."}
          </p>
          {rows.length === 0 && (
            <Link href="/inspect" className="mt-4 inline-block">
              <Button size="sm">Inspect your first URL</Button>
            </Link>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <GlassCard key={row.id} className="group p-3.5 transition-colors hover:border-white/[0.14]">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold",
                    (row.status_code ?? 0) >= 200 && (row.status_code ?? 0) < 300
                      ? "bg-emerald-400/15 text-emerald-300"
                      : (row.status_code ?? 0) >= 400
                        ? "bg-rose-400/15 text-rose-300"
                        : "bg-amber-400/15 text-amber-300",
                  )}
                >
                  {row.status_code ?? "—"}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-medium text-white">
                      {row.title ?? row.host}
                    </span>
                    <a
                      href={row.final_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="shrink-0 text-zinc-600 transition-colors hover:text-zinc-300"
                      aria-label="Open the inspected page"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="truncate font-mono text-[11px] text-zinc-500">{row.input_url}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-600">
                    <span>{formatRelativeTime(row.created_at)}</span>
                    {row.duration_ms !== null && <span>{row.duration_ms} ms</span>}
                    {row.payload_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-indigo-400/80">
                        <Binary className="h-2.5 w-2.5" />
                        {row.payload_count} decoded
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void remove(row.id)}
                  disabled={removing === row.id}
                  aria-label="Delete this inspection"
                  className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:bg-rose-500/15 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
