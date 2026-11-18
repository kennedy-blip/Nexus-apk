import { cn } from "@/lib/utils";

/** NexusScope mark: an interlocked "N" built from two neon strokes. */
export function Logo({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-xl",
        "bg-gradient-to-br from-indigo-500/25 via-violet-500/15 to-cyan-500/20",
        "border border-white/12 shadow-[0_0_24px_-6px_rgba(99,102,241,0.75)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.62}
        height={size * 0.62}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="nx-grad" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
            <stop stopColor="#67e8f9" />
            <stop offset="0.5" stopColor="#a5b4fc" />
            <stop offset="1" stopColor="#c4b5fd" />
          </linearGradient>
        </defs>
        <path
          d="M5 19V5l14 14V5"
          stroke="url(#nx-grad)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-tight text-white", className)}>
      Nexus<span className="text-gradient">Scope</span>
    </span>
  );
}
