import { cn } from "@/lib/utils";
import type { SessionState } from "@/lib/types";

const sessionTone: Record<SessionState, { dot: string; text: string; bg: string; label: string }> = {
  pending: { dot: "bg-zinc-400", text: "text-zinc-300", bg: "bg-zinc-500/10 border-zinc-400/20", label: "Queued" },
  provisioning: { dot: "bg-amber-400", text: "text-amber-200", bg: "bg-amber-500/10 border-amber-400/25", label: "Provisioning" },
  installing: { dot: "bg-cyan-400", text: "text-cyan-200", bg: "bg-cyan-500/10 border-cyan-400/25", label: "Installing APK" },
  running: { dot: "bg-emerald-400", text: "text-emerald-200", bg: "bg-emerald-500/10 border-emerald-400/25", label: "Live" },
  stopping: { dot: "bg-orange-400", text: "text-orange-200", bg: "bg-orange-500/10 border-orange-400/25", label: "Stopping" },
  stopped: { dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-600/10 border-zinc-500/20", label: "Stopped" },
  failed: { dot: "bg-rose-400", text: "text-rose-200", bg: "bg-rose-500/10 border-rose-400/25", label: "Failed" },
};

export function StatusPill({
  state,
  className,
  pulse = true,
}: {
  state: SessionState;
  className?: string;
  pulse?: boolean;
}) {
  const tone = sessionTone[state] ?? sessionTone.pending;
  const animated = pulse && (state === "running" || state === "provisioning" || state === "installing");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] backdrop-blur-md",
        tone.bg,
        tone.text,
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {animated && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              tone.dot,
            )}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", tone.dot)} />
      </span>
      {tone.label}
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("h-1.5 w-1.5 rounded-full", className)} />;
}
