"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[NexusAPK dashboard]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <h2 className="text-[17px] font-semibold text-white">Couldn&apos;t load your library</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
        {error.message || "The APK index is temporarily unavailable."}
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2 text-[12.5px] text-white transition-colors hover:bg-white/[0.12]"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reload library
      </button>
    </div>
  );
}
