"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Circle, Terminal } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { SessionEvent } from "@/lib/types";

const levelTone = {
  debug: "text-zinc-500",
  info: "text-zinc-300",
  warn: "text-amber-300",
  error: "text-rose-300",
} as const;

/**
 * Streaming workspace log. New rows slide in; the container auto-scrolls only
 * while the user is already parked at the bottom.
 */
export function SessionConsole({
  events,
  uptime,
  connected,
}: {
  events: SessionEvent[];
  uptime: number;
  connected: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !pinned.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          <Terminal className="h-3 w-3" />
          Session log
        </div>
        <div className="flex items-center gap-2 font-mono text-[10.5px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Circle
              className={cn(
                "h-1.5 w-1.5 fill-current",
                connected ? "text-emerald-400" : "text-zinc-600",
              )}
            />
            {connected ? "live" : "idle"}
          </span>
          <span className="tabular-nums">{formatDuration(uptime)}</span>
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
      >
        {events.length === 0 && (
          <p className="text-zinc-600">Waiting for the device to report in…</p>
        )}
        {events.map((event) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2"
          >
            <span className="shrink-0 text-zinc-600">
              {new Date(event.created_at).toLocaleTimeString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            <span className={cn("min-w-0 break-words", levelTone[event.level])}>
              {event.message}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
