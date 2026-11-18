import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ScanLine } from "lucide-react";
import { Logo, Wordmark } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroReport } from "@/components/marketing/hero-device";
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
      if (user) redirect("/inspect");
    } catch {
      /* unconfigured — render the landing page */
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
            <a href="#features" className="transition-colors hover:text-white">What you get</a>
            <a href="#pipeline" className="transition-colors hover:text-white">How it works</a>
            <a href="#honesty" className="transition-colors hover:text-white">Limits</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/inspect" className="hidden sm:block">
              <Button variant="ghost" size="sm">Try it</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/inspect">
              <Button size="sm" className="group">
                Inspect a URL
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
                <ScanLine className="h-3 w-3 text-cyan-300" />
                Link &amp; site inspection
              </div>

              <h1 className="text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-6xl">
                Paste a link.
                <br />
                <span className="text-gradient">See everything it says.</span>
              </h1>

              <p className="mt-6 max-w-lg text-[15.5px] leading-relaxed text-zinc-400">
                NexusScope fetches any public URL and reports what it hands to an anonymous
                visitor: preview metadata, the full redirect chain, DNS, the TLS certificate,
                security headers, outbound destinations — and every encoded payload decoded
                back into readable text.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/inspect">
                  <Button size="lg" className="group">
                    Inspect a URL free
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="secondary">
                    Sign in for unlimited
                  </Button>
                </Link>
              </div>

              <dl className="mt-12 grid max-w-md grid-cols-3 gap-4">
                {[
                  { k: "Any URL", v: "sites & posts" },
                  { k: "No login", v: "to try it" },
                  { k: "JSON", v: "export" },
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

            <HeroReport />
          </div>
        </section>

        <PipelineStrip />
        <FeatureGrid />

        {/* ---------------- honesty / CTA ---------------- */}
        <section id="honesty" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8">
          <GlassCard variant="strong" edge className="relative overflow-hidden px-6 py-12 sm:px-14 sm:py-16">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.4),transparent)] blur-2xl"
            />
            <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <h2 className="text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
                  Public data only. And we say so.
                </h2>
                <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-zinc-400">
                  NexusScope reads what any anonymous visitor would receive. It does not log
                  in, does not touch private accounts, does not execute scripts, and does not
                  break encryption. When a field cannot be read, the report says so instead of
                  inventing a value.
                </p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {[
                    "SSRF-guarded fetching",
                    "No JavaScript execution",
                    "No login bypass",
                    "Decoded, not cracked",
                    "Honest gaps",
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

              <div className="space-y-2.5">
                {[
                  { label: "Login-walled pages", value: "Public shell only" },
                  { label: "Script-rendered content", value: "Not executed" },
                  { label: "Private accounts", value: "Not accessible" },
                  { label: "Your history", value: "Unlimited, never expires" },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="glass-subtle flex items-center justify-between gap-4 rounded-xl px-4 py-3"
                  >
                    <span className="text-[12.5px] text-zinc-400">{row.label}</span>
                    <span className="text-right text-[12.5px] font-medium text-zinc-200">{row.value}</span>
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
            <span>© {new Date().getFullYear()} NexusScope</span>
          </div>
          <p className="text-center sm:text-right">
            Inspect responsibly — respect each site&apos;s robots.txt and terms.
          </p>
        </div>
      </footer>
    </div>
  );
}
