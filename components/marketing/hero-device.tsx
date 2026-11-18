"use client";

import { motion } from "framer-motion";
import { Activity, Wifi } from "lucide-react";

const rows = [
  { name: "Bolt Rides", pkg: "io.boltrides.app", tone: "from-cyan-400/80 to-sky-500/80" },
  { name: "Ledger Pro", pkg: "com.ledger.pro", tone: "from-violet-400/80 to-indigo-500/80" },
  { name: "Pixel Notes", pkg: "app.pixel.notes", tone: "from-emerald-400/80 to-teal-500/80" },
];

/**
 * Static-but-alive hero mock of the workspace. The "screen" is a CSS
 * composition rather than a video so the landing page stays instant.
 */
export function HeroDevice() {
  return (
    <div className="relative flex items-center justify-center">
      <div
        aria-hidden
        className="device-aura animate-float absolute h-[26rem] w-[26rem] rounded-full"
      />

      <motion.div
        initial={{ opacity: 0, y: 28, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.15 }}
        className="relative"
        style={{ perspective: 1200 }}
      >
        <div className="device-shell relative w-[278px] rounded-[2.6rem] p-[10px] sm:w-[300px]">
          <div className="device-screen device-gloss relative aspect-[9/19.2] overflow-hidden rounded-[2.1rem]">
            {/* status bar */}
            <div className="flex items-center justify-between px-5 pt-3 text-[10px] text-zinc-400">
              <span className="font-medium">9:41</span>
              <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-black/80 ring-1 ring-white/5" />
              <div className="flex items-center gap-1">
                <Wifi className="h-2.5 w-2.5" />
                <span className="h-2 w-4 rounded-[2px] border border-zinc-500/70 p-[1px]">
                  <span className="block h-full w-3/4 rounded-[1px] bg-emerald-400/90" />
                </span>
              </div>
            </div>

            {/* app content */}
            <div className="px-4 pt-6">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Workspace</p>
              <h3 className="mt-1 text-[17px] font-semibold tracking-tight text-white">
                Bolt Rides
              </h3>
              <p className="font-mono text-[9.5px] text-zinc-500">io.boltrides.app · v4.2.1</p>

              <div className="mt-4 space-y-2">
                {rows.map((r, i) => (
                  <motion.div
                    key={r.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.12, type: "spring", stiffness: 200, damping: 22 }}
                    className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.035] p-2"
                  >
                    <span className={`h-6 w-6 rounded-lg bg-gradient-to-br ${r.tone}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10.5px] font-medium text-zinc-200">
                        {r.name}
                      </span>
                      <span className="block truncate font-mono text-[8.5px] text-zinc-500">
                        {r.pkg}
                      </span>
                    </span>
                    <span className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-emerald-300">
                      live
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* fake map / app surface */}
              <div className="relative mt-4 h-28 overflow-hidden rounded-xl border border-white/[0.07] bg-[radial-gradient(circle_at_30%_20%,rgba(6,182,212,0.22),transparent_60%),radial-gradient(circle_at_75%_75%,rgba(139,92,246,0.22),transparent_55%)]">
                <div className="absolute inset-0 bg-grid opacity-40" />
                <div className="scanline absolute inset-x-0 animate-scan" />
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_14px_4px_rgba(103,232,249,0.55)]" />
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2">
                <span className="flex items-center gap-1.5 text-[9px] text-zinc-400">
                  <Activity className="h-2.5 w-2.5 text-emerald-400" />
                  58 fps · 42 ms
                </span>
                <span className="text-[9px] font-mono text-zinc-500">14:52</span>
              </div>
            </div>

            {/* nav bar */}
            <div className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-10">
              <span className="h-1.5 w-1.5 rotate-45 border border-zinc-500/80" />
              <span className="h-2 w-2 rounded-full border border-zinc-500/80" />
              <span className="h-1.5 w-2.5 rounded-sm border border-zinc-500/80" />
            </div>
          </div>

          {/* side buttons */}
          <span className="absolute -right-[3px] top-28 h-12 w-[3px] rounded-r bg-zinc-700/90" />
          <span className="absolute -right-[3px] top-44 h-8 w-[3px] rounded-r bg-zinc-700/90" />
          <span className="absolute -left-[3px] top-32 h-9 w-[3px] rounded-l bg-zinc-700/90" />
        </div>

        {/* floating glass chips */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="glass-strong animate-float absolute -left-16 top-16 hidden rounded-2xl px-3 py-2 sm:block"
          style={{ animationDelay: "-3s" }}
        >
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Encoder</p>
          <p className="text-xs font-medium text-white">H.264 · 60 fps</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05 }}
          className="glass-strong animate-float absolute -right-14 bottom-24 hidden rounded-2xl px-3 py-2 sm:block"
          style={{ animationDelay: "-6s" }}
        >
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Container</p>
          <p className="font-mono text-xs font-medium text-emerald-300">healthy</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
