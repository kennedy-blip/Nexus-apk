"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Copy, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { InspectForm, EmptyState } from "./inspect-form";
import { ReportView } from "./report-view";
import type { InspectionReport } from "@/lib/inspect/report";

export function InspectorWorkspace({ signedIn }: { signedIn: boolean }) {
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | undefined>();

  const onError = useCallback((message: string, code?: string) => {
    setError(message);
    setErrorCode(code);
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <header className="mb-1">
        <h1 className="text-[22px] font-semibold tracking-tight text-white">
          Link &amp; Site Inspector
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-zinc-400">
          Paste any public URL and see everything it hands out: preview metadata, redirects,
          DNS, TLS, security headers, outbound links, and any encoded payloads decoded back to
          text.
        </p>
      </header>

      <InspectForm
        signedIn={signedIn}
        onReport={(next) => {
          setReport(next);
          setError("");
        }}
        onError={onError}
      />

      {error && (
        <GlassCard className="border-rose-400/25 bg-rose-500/[0.06] p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-relaxed text-rose-100">{error}</p>
              {errorCode && (
                <p className="mt-1 font-mono text-[11px] text-rose-300/70">reason: {errorCode}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              className="text-rose-300/60 transition-colors hover:text-rose-200"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </GlassCard>
      )}

      <AnimatePresence mode="wait">
        {report ? (
          <motion.div
            key={report.finalUrl + report.inspectedAt}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ReportView report={report} />
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyState />
          </motion.div>
        )}
      </AnimatePresence>

      <p className="flex items-start gap-1.5 pt-2 text-[11px] leading-relaxed text-zinc-600">
        <Copy className="mt-0.5 h-3 w-3 shrink-0" />
        Only publicly available content is inspected. Pages behind a login return their public
        shell, and JavaScript-injected content is not executed. Always respect a site&apos;s
        robots.txt and terms.
      </p>
    </div>
  );
}
