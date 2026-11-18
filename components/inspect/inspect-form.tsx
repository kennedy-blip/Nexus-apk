"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link2, Loader2, ScanLine, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import type { InspectionReport } from "@/lib/inspect/report";

interface Props {
  onReport: (report: InspectionReport) => void;
  onError: (message: string, code?: string) => void;
  signedIn: boolean;
}

const EXAMPLES = [
  { label: "Website", value: "https://example.com" },
  { label: "Instagram post", value: "https://www.instagram.com/p/C_example/" },
  { label: "Business site", value: "https://safaricom.co.ke" },
  { label: "News article", value: "https://www.bbc.com/news" },
];

export function InspectForm({ onReport, onError, signedIn }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (target: string) => {
      const trimmed = target.trim();
      if (!trimmed || loading) return;

      setLoading(true);
      onError("");
      try {
        const response = await fetch("/api/inspect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        const data = await response.json();

        if (!response.ok) {
          onError(data.error ?? `Request failed (${response.status})`, data.code);
          return;
        }
        onReport(data.report as InspectionReport);
      } catch (error) {
        onError(
          error instanceof Error
            ? `Could not reach the inspector: ${error.message}`
            : "Could not reach the inspector",
          "network",
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, onError, onReport],
  );

  return (
    <GlassCard variant="strong" edge className="p-1.5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(value);
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste any URL — a website, a post, an article"
            aria-label="URL to inspect"
            autoComplete="off"
            spellCheck={false}
            className="h-14 w-full rounded-2xl border border-transparent bg-transparent pl-11 pr-4 text-[15px] text-white placeholder:text-zinc-500 focus:outline-none"
          />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={loading || !value.trim()}
          className="h-14 shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Inspecting
            </>
          ) : (
            <>
              <ScanLine className="h-4 w-4" />
              Inspect
            </>
          )}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Try
        </span>
        {EXAMPLES.map((example) => (
          <button
            key={example.value}
            type="button"
            onClick={() => {
              setValue(example.value);
              void run(example.value);
            }}
            className="rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] text-zinc-400 transition-colors hover:border-indigo-400/40 hover:text-white"
          >
            {example.label}
          </button>
        ))}
      </div>

      {!signedIn && (
        <div className="flex items-start gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 mx-1 mb-1">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <p className="text-[12px] leading-relaxed text-zinc-400">
            Demo allowance: 5 inspections per 10 minutes.{" "}
            <a href="/login" className="text-indigo-300 underline-offset-2 hover:underline">
              Sign in
            </a>{" "}
            for unlimited use.
          </p>
        </div>
      )}

      {loading && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 11, ease: "linear" }}
          className="h-0.5 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-transparent"
        />
      )}
    </GlassCard>
  );
}

export function EmptyState() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        {
          icon: Sparkles,
          title: "Everything public",
          body: "Metadata, OpenGraph, JSON-LD, feeds, headings and outbound links — whatever the URL serves to any visitor.",
        },
        {
          icon: ShieldCheck,
          title: "Decoded, not cracked",
          body: "Base64 blobs, JWT claim payloads, hex and HTML entities turned back into readable text.",
        },
        {
          icon: ScanLine,
          title: "The whole path",
          body: "Redirect chain, DNS, TLS certificate, robots.txt, security headers and tech fingerprint.",
        },
      ].map((card) => (
        <div
          key={card.title}
          className={cn(
            "rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors",
            "hover:border-white/[0.12]",
          )}
        >
          <card.icon className="h-4 w-4 text-indigo-300" />
          <h3 className="mt-2.5 text-[13.5px] font-semibold text-white">{card.title}</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400">{card.body}</p>
        </div>
      ))}
    </div>
  );
}
