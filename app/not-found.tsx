import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center text-center">
        <Logo size={40} />
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.24em] text-zinc-500">
          404 · not found
        </p>
        <h1 className="mt-2 text-[22px] font-semibold text-white">
          That device or app isn&apos;t here
        </h1>
        <p className="mt-2 max-w-sm text-[13px] text-zinc-400">
          Sessions are destroyed when they expire, so an old playground link may
          no longer resolve.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-[12.5px] text-white transition-colors hover:bg-white/[0.12]"
        >
          Back to library
        </Link>
      </div>
    </div>
  );
}
