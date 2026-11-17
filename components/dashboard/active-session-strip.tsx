"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Radio } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { formatRelativeTime } from "@/lib/utils";
import type { SessionRecord } from "@/lib/types";

export function ActiveSessionStrip({ sessions }: { sessions: SessionRecord[] }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl border border-indigo-400/20 bg-gradient-to-r from-indigo-500/[0.09] via-violet-500/[0.05] to-transparent p-3 backdrop-blur-xl"
    >
      <div className="mb-2 flex items-center gap-1.5 px-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-indigo-300">
        <Radio className="h-3 w-3 animate-pulse" />
        Active devices
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/playground/${s.id}`}
            className="group flex min-w-[15rem] shrink-0 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 transition-colors hover:border-indigo-400/40 hover:bg-white/[0.06]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11.5px] text-zinc-300">
                {s.id.slice(0, 8)} · {s.device_profile}
              </p>
              <p className="text-[10.5px] text-zinc-500">
                started {formatRelativeTime(s.started_at)}
              </p>
            </div>
            <StatusPill state={s.state} />
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 transition-colors group-hover:text-indigo-300" />
          </Link>
        ))}
      </div>
    </motion.section>
  );
}
