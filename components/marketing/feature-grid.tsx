"use client";

import { motion } from "framer-motion";
import {
  Binary,
  Braces,
  FileSearch,
  Globe2,
  Layers,
  Lock,
  Network,
  ShieldCheck,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

const features = [
  {
    icon: Layers,
    title: "Link preview, exactly as platforms read it",
    copy: "Title, description, OpenGraph and Twitter card images, canonical URL, site name, language and theme colour — the fields WhatsApp, Slack and X use to build a preview.",
    span: "sm:col-span-2",
  },
  {
    icon: Network,
    title: "The whole path",
    copy: "Every redirect hop with its status and timing, the addresses it resolved to, and where it finally landed.",
  },
  {
    icon: Lock,
    title: "TLS, DNS and headers",
    copy: "Certificate issuer, validity and SANs; A/AAAA/CNAME/MX/NS/TXT/CAA records; and which security headers are missing.",
  },
  {
    icon: Binary,
    title: "Encoded payloads, decoded",
    copy: "Base64 blobs, hex runs, JWT claim sections and HTML entities turned back into readable text — decoding, never cracking.",
    span: "sm:col-span-2",
  },
  {
    icon: Braces,
    title: "Structured data",
    copy: "JSON-LD, feeds and meta tags parsed into a table you can copy.",
  },
  {
    icon: FileSearch,
    title: "What is actually there",
    copy: "Visible text, outbound hosts, form and iframe counts — enough to tell a real page from a login wall.",
  },
  {
    icon: ShieldCheck,
    title: "robots.txt verdict",
    copy: "Whether the path is allowed for crawlers, with the matching rule quoted, plus every sitemap it declares.",
  },
  {
    icon: Globe2,
    title: "Honest about limits",
    copy: "Every report states what it could not read. Nothing is guessed and no field is invented to look complete.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
      <div className="mb-10 max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-indigo-300/80">
          What you get back
        </p>
        <h2 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
          One paste, every public fact
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
          A single request collects what the URL serves to any anonymous visitor, then
          reports it in sections you can read, copy or export as JSON.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3) }}
            className={feature.span}
          >
            <GlassCard interactive className="h-full p-5">
              <feature.icon className="h-4.5 w-4.5 text-indigo-300" />
              <h3 className="mt-3 text-[14px] font-semibold text-white">{feature.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{feature.copy}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
