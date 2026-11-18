import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Zap } from "lucide-react";
import { GithubMark } from "@/components/ui/github-mark";
import { Logo, Wordmark } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroDevice } from "@/components/marketing/hero-device";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PipelineStrip } from "@/components/marketing/pipeline-strip";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  // If Supabase is configured and the visitor already has a session, skip ahead.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) redirect("/dashboard");
    } catch {
      /* demo mode — render the landing page */
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#09090b]/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={30} />
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-8 text-[13.5px] text-zinc-400 md:flex">
            <a href="#features" className="transition-colors hover:text-white">Platform</a>
            <a href="#pipeline" className="transition-colors hover:text-white">Pipeline</a>
            <a href="#specs" className="transition-colors hover:text-white">Specs</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/demo" className="hidden sm:block">
              <Button variant="ghost" size="sm">Live demo</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="group">
                Launch studio
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ---------------- hero ---------------- */}
        <section className="relative mx-auto w-full max-w-7xl px-5 pb-10 pt-14 sm:px-8 sm:pt-20">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.16em] text-indigo-200 backdrop-blur-xl">
                <Zap className="h-3 w-3 text-cyan-300" />
                Cloud Android, zero installs
              </div>

              <h1 className="text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-6xl">
                Stream any APK
                <br />
                <span className="text-gradient">straight to your browser</span>
              </h1>

              <p className="mt-6 max-w-lg text-[15.5px] leading-relaxed text-zinc-400">
                Drop an <span className="font-mono text-[14px] text-zinc-300">.apk</span> into
                NexusAPK Studio and a dedicated cloud device boots in seconds. Real
                touch input, real Android, under 100 ms of latency — no emulator,
                no cable, no SDK.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/login">
                  <Button size="lg" className="group">
                    Start streaming free
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/demo">
                  <Button size="lg" variant="secondary">
                    <GithubMark className="h-4 w-4" />
                    Try the live demo
                  </Button>
                </Link>
              </div>

              <dl className="mt-12 grid max-w-md grid-cols-3 gap-4">
                {[
                  { k: "<100ms", v: "input latency" },
                  { k: "12s", v: "cold boot" },
                  { k: "180+", v: "devices online" },
                ].map((s) => (
                  <div key={s.v}>
                    <dt className="text-xl font-semibold tracking-tight text-white">{s.k}</dt>
                    <dd className="mt-0.5 text-[11.5px] uppercase tracking-[0.1em] text-zinc-500">
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <HeroDevice />
          </div>
        </section>

        <PipelineStrip />
        <FeatureGrid />

        {/* ---------------- specs / CTA ---------------- */}
        <section id="specs" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
          <GlassCard
            variant="strong"
            edge
            className="relative overflow-hidden px-6 py-12 sm:px-14 sm:py-16"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.4),transparent)] blur-2xl"
            />
            <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <h2 className="text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
                  Built on real Android kernels, not simulators.
                </h2>
                <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-zinc-400">
                  Every session is an isolated <span className="text-zinc-200">redroid</span>{" "}
                  container with its own display, ADB bridge and GPU-backed
                  encoder. Your APK never touches other tenants&apos; storage, and
                  containers are wiped the moment a session ends.
                </p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {[
                    "redroid / ARM64",
                    "scrcpy + WebRTC",
                    "Postgres RLS",
                    "Signed URLs",
                    "15-min auto-cleanup",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11.5px] text-zinc-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "CPU", value: "4 vCPU", sub: "per session" },
                  { label: "Memory", value: "6 GB", sub: "dedicated" },
                  { label: "Encoder", value: "H.264", sub: "hardware" },
                  { label: "Isolation", value: "1:1", sub: "container" },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="glass-subtle rounded-2xl p-4 transition-colors hover:bg-white/[0.05]"
                  >
                    <p className="text-[10.5px] uppercase tracking-[0.16em] text-zinc-500">
                      {m.label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">{m.value}</p>
                    <p className="text-[11.5px] text-zinc-500">{m.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-5 py-7 text-[12.5px] text-zinc-500 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2.5">
            <Logo size={22} />
            <span>© {new Date().getFullYear()} NexusAPK Studio</span>
          </div>
          <p className="text-center sm:text-right">
            Session compute runs on your own orchestrator — bring your own
            Docker host.
          </p>
        </div>
      </footer>
    </div>
  );
}
