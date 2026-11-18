"use client";

import { motion } from "framer-motion";
import {
  Fingerprint,
  Gauge,
  Keyboard,
  Layers,
  Lock,
  MonitorPlay,
  Smartphone,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

const features = [
  {
    icon: MonitorPlay,
    title: "Pixel-accurate streaming",
    copy: "scrcpy delivers the raw framebuffer over WebRTC, so text stays razor sharp and scrolling is buttery at 60 fps.",
    span: "sm:col-span-2",
  },
  {
    icon: Fingerprint,
    title: "Real touch mapping",
    copy: "Click, drag, long-press multi-touch and keyboard input are translated to native Android events.",
    span: "",
  },
  {
    icon: Lock,
    title: "Isolated by default",
    copy: "Every APK lives in a per-user storage folder behind RLS and short-lived signed URLs.",
    span: "",
  },
  {
    icon: Gauge,
    title: "Warm-node scheduling",
    copy: "Containers are placed on pre-warmed Docker hosts, so a session boots in seconds and stays up until you end it.",
    span: "sm:col-span-2",
  },
  {
    icon: Keyboard,
    title: "Hardware controls",
    copy: "Power, volume, home, back and rotation are wired to ADB — no emulator toolbar guesswork.",
    span: "",
  },
  {
    icon: Layers,
    title: "Session telemetry",
    copy: "Every boot, install and teardown step is logged and streamed into the workspace console.",
    span: "",
  },
  {
    icon: Smartphone,
    title: "Adaptive device frames",
    copy: "Phone, XL and tablet viewports keep the exact aspect ratio and DPI of the emulated display.",
    span: "",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative mx-auto w-full max-w-7xl px-5 py-10 sm:px-8">
      <div className="mb-10 max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-indigo-300/80">
          Platform
        </p>
        <h2 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
          Everything a device lab gives you, minus the device lab.
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: (i % 4) * 0.06, type: "spring", stiffness: 220, damping: 26 }}
            className={f.span}
          >
            <GlassCard
              interactive
              edge
              className="group h-full p-5"
            >
              <span className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 text-indigo-300 transition-all duration-300 group-hover:scale-105 group-hover:text-cyan-200">
                <f.icon className="h-4 w-4" />
              </span>
              <h3 className="text-[14px] font-semibold tracking-tight text-white">{f.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">{f.copy}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
