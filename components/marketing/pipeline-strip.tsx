"use client";

import { motion } from "framer-motion";
import { Binary, Download, Network, ScanLine, ShieldCheck } from "lucide-react";

const steps = [
  {
    icon: ScanLine,
    title: "Validate",
    copy: "The host is resolved and every address checked before a socket opens. Loopback, private and cloud-metadata targets are refused.",
  },
  {
    icon: Network,
    title: "Fetch",
    copy: "Redirects are followed one hop at a time, each re-validated, on a socket pinned to the address already approved.",
  },
  {
    icon: Binary,
    title: "Extract",
    copy: "Metadata, structured data, links and encoded payloads are parsed from the bounded response body.",
  },
  {
    icon: ShieldCheck,
    title: "Audit",
    copy: "TLS, DNS, security headers and robots.txt are collected in parallel and reduced to a traffic-light summary.",
  },
  {
    icon: Download,
    title: "Report",
    copy: "Everything is returned as one JSON document, with every gap stated rather than filled in.",
  },
];

export function PipelineStrip() {
  return (
    <section id="pipeline" className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
      <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-indigo-300/80">
            How it works
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-white">
            Five stages, one request
          </h2>
        </div>
        <p className="max-w-sm text-[13px] leading-relaxed text-zinc-500">
          No headless browser, no queue, no container. The whole inspection runs inside one
          serverless invocation.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, index) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.3, delay: index * 0.06 }}
            className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"
          >
            <span className="font-mono text-[10px] text-zinc-600">
              {String(index + 1).padStart(2, "0")}
            </span>
            <step.icon className="mt-2 h-4 w-4 text-indigo-300" />
            <h3 className="mt-2 text-[13px] font-semibold text-white">{step.title}</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{step.copy}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
