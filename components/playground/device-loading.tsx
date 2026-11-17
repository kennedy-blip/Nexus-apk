import { Logo } from "@/components/ui/logo";

/** Suspense fallback shown while the workspace + session are resolved. */
export function DeviceLoading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <span className="absolute inset-0 animate-ping rounded-2xl bg-indigo-500/25" />
          <Logo size={44} />
        </div>
        <p className="font-mono text-[11.5px] uppercase tracking-[0.2em] text-zinc-500">
          attaching to device…
        </p>
      </div>
    </div>
  );
}
