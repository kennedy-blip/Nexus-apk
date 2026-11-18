"use client";

import { motion } from "framer-motion";
import { Binary, Check, Globe, Lock, TriangleAlert } from "lucide-react";

/** Facts rendered in the hero panel — illustrative, clearly labelled. */
const sample = [
  { status: "301", host: "bit.ly", note: "redirect" },
  { status: "200", host: "acme.co.ke", note: "final" },
];

const decoded = [
  { kind: "jwt", text: '{"sub":"1042","role":"viewer"}' },
  { kind: "base64", text: '{"store":"Nairobi CBD"}' },
];

/**
 * Hero visual: a report card, not a fake phone.
 *
 * Everything shown is a *sample report*, labelled as such, because this project
 * already learned what happens when a mock is presented as a live device.
 */
export function HeroReport() {
  return (
    <div className="relative flex items-center justify-center">
      <div aria-hidden className="device-aura animate-float absolute h-[24rem] w-[24rem] rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.15 }}
        className="relative w-full max-w-md"
      >
        <div className="glass-strong neon-edge overflow-hidden rounded-3xl">
          {/* window chrome */}
          <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-4 py-2.5">
            <span className="h-2 w-2 rounded-full bg-rose-400/70" />
            <span className="h-2 w-2 rounded-full bg-amber-400/70" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
            <span className="ml-2 font-mono text-[10.5px] text-zinc-500">nexusscope · sample report</span>
          </div>

          <div className="space-y-3 p-4">
            {/* verdict */}
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-300">
                200
              </span>
              <span className="text-[12.5px] font-medium text-zinc-200">Acme &amp; Sons — Nairobi</span>
            </div>

            {/* redirects */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-zinc-500">
                <Globe className="h-2.5 w-2.5" /> redirect chain
              </div>
              {sample.map((hop, index) => (
                <div key={hop.host} className="mt-1.5 flex items-center gap-2">
                  <span className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[9.5px] text-zinc-400">
                    {hop.status}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-300">{hop.host}</span>
                  <span className="text-[10px] text-zinc-600">{hop.note}</span>
                  {index === 0 && <span className="text-[10px] text-zinc-600">→</span>}
                </div>
              ))}
            </div>

            {/* decoded */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-zinc-500">
                <Binary className="h-2.5 w-2.5" /> decoded payloads
              </div>
              {decoded.map((blob) => (
                <div key={blob.kind} className="mt-1.5 flex items-baseline gap-2">
                  <span className="rounded bg-indigo-500/15 px-1 py-0.5 font-mono text-[9px] font-semibold uppercase text-indigo-300">
                    {blob.kind}
                  </span>
                  <span className="truncate font-mono text-[10.5px] text-emerald-300/80">{blob.text}</span>
                </div>
              ))}
            </div>

            {/* signals */}
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/[0.06] px-2 py-0.5 text-[10.5px] text-emerald-300">
                <Check className="h-2.5 w-2.5" /> HTTPS
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/[0.06] px-2 py-0.5 text-[10.5px] text-emerald-300">
                <Lock className="h-2.5 w-2.5" /> cert 63d
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/[0.06] px-2 py-0.5 text-[10.5px] text-amber-300">
                <TriangleAlert className="h-2.5 w-2.5" /> no CSP
              </span>
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-[10.5px] text-zinc-600">
          Illustrative sample — not a live inspection.
        </p>
      </motion.div>
    </div>
  );
}
