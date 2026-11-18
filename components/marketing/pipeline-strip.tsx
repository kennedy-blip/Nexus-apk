"use client";

import { motion } from "framer-motion";
import { Boxes, Cpu, MonitorPlay, ShieldCheck, UploadCloud } from "lucide-react";

const steps = [
  { icon: UploadCloud, title: "Upload", copy: "Signed, resumable APK upload straight to object storage." },
  { icon: Cpu, title: "Parse", copy: "Manifest, package name, SDK range and icon extracted server-side." },
  { icon: Boxes, title: "Provision", copy: "A redroid container boots on a warm node with a private ADB port." },
  { icon: MonitorPlay, title: "Stream", copy: "scrcpy bridges the framebuffer into WebRTC for sub-100 ms video." },
  { icon: ShieldCheck, title: "Destroy", copy: "Idle sessions are reaped at 15 minutes; storage is purged." },
];

export function PipelineStrip() {
  return (
    <section id="pipeline" className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
      <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-indigo-300/80">
            The pipeline
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-white">
            Five stages, one request
          </h2>
        </div>
        <p className="max-w-sm text-[14px] leading-relaxed text-zinc-500">
          Upload to streaming is a single orchestrated flow — no build step, no
          local toolchain, no waiting on a queue you can&apos;t see.
        </p>
      </div>

      <div className="relative grid gap-3 lg:grid-cols-5">
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-[3.15rem] hidden h-px bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent lg:block"
        />
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.07, type: "spring", stiffness: 220, damping: 26 }}
            className="group relative"
          >
            <div className="glass relative h-full rounded-2xl p-4 transition-colors duration-300 group-hover:bg-white/[0.06]">
              <div className="mb-4 flex items-center justify-between">
                <span className="relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#12121a] text-indigo-300 transition-colors group-hover:text-cyan-300">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="font-mono text-[10.5px] text-zinc-600">
                  0{i + 1}
                </span>
              </div>
              <h3 className="text-[14px] font-semibold text-white">{s.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">{s.copy}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
