"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Route-level error boundary for the whole app tree. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this is where a telemetry sink (Sentry, Axiom…) hooks in.
    console.error("[NexusScope]", error);
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="glass-strong w-full max-w-md rounded-3xl p-7 text-center">
        <span className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/10 text-rose-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="text-[17px] font-semibold text-white">Something broke in the workspace</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">
          {error.message || "An unexpected error occurred while rendering this view."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[10.5px] text-zinc-600">digest {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2 text-[12.5px] text-white transition-colors hover:bg-white/[0.12]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
