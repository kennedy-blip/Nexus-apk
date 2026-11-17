"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { GithubMark } from "@/components/ui/github-mark";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

export function AuthPanel({
  configured,
  next,
  error,
  initialProvider,
}: {
  configured: boolean;
  next: string;
  error: string | null;
  initialProvider?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<
    null | "email" | "github" | "magic" | "recovery"
  >(null);
  const [notice, setNotice] = useState<string | null>(error);

  // Deep-link: /login?provider=github kicks off OAuth straight away.
  useEffect(() => {
    if (initialProvider === "github" && configured) void signInWithGithub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signInWithGithub() {
    if (!configured) return;
    setPending("github");
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "read:user user:email",
      },
    });
    if (oauthError) {
      setPending(null);
      setNotice(oauthError.message);
      toast.error("GitHub sign-in failed", oauthError.message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) return;
    setPending("email");
    setNotice(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      setPending(null);
      if (signUpError) {
        setNotice(signUpError.message);
        return;
      }
      toast.success("Check your inbox", "Confirm your email to activate the workspace.");
      setNotice("We sent a confirmation link to your email.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPending(null);
    if (signInError) {
      setNotice(signInError.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleRecovery() {
    if (!configured) return;
    if (!email) {
      setNotice("Enter your email first, then choose \"Forgot password\".");
      return;
    }
    setPending("recovery");
    const supabase = createClient();
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setPending(null);
    if (recoveryError) {
      setNotice(recoveryError.message);
      return;
    }
    toast.success("Recovery link sent", `Check ${email} to set a new password.`);
    setNotice("Recovery link sent — it expires in one hour.");
  }

  async function handleMagicLink() {
    if (!configured || !email) {
      setNotice("Enter your email first.");
      return;
    }
    setPending("magic");
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setPending(null);
    if (otpError) {
      setNotice(otpError.message);
      return;
    }
    toast.success("Magic link sent", `Open the email sent to ${email}.`);
    setNotice("Magic link sent — check your inbox.");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 180, damping: 24 }}
      className="w-full max-w-[26.5rem]"
    >
      <GlassCard variant="strong" edge sheen className="p-7 sm:p-8">
        <div className="mb-7">
          <h1 className="text-[22px] font-semibold tracking-tight text-white">
            {mode === "signin" ? "Welcome back" : "Create your workspace"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-400">
            {mode === "signin"
              ? "Sign in to upload APKs and boot cloud devices."
              : "Free tier includes 30 streaming minutes per month."}
          </p>
        </div>

        {!configured && (
          <div className="mb-5 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-[12.5px] leading-relaxed text-amber-200">
            Supabase credentials are missing. Copy{" "}
            <code className="font-mono text-amber-100">.env.example</code> to{" "}
            <code className="font-mono text-amber-100">.env.local</code> and add your
            project URL + anon key to enable sign-in.
          </div>
        )}

        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={signInWithGithub}
          loading={pending === "github"}
          disabled={!configured}
        >
          {pending === "github" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GithubMark className="h-4 w-4" />
          )}
          Continue with GitHub
        </Button>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-white/8" />
          <span className="text-[10.5px] uppercase tracking-[0.18em] text-zinc-600">
            or email
          </span>
          <span className="h-px flex-1 bg-white/8" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-zinc-500">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.dev"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[14px] text-white placeholder:text-zinc-600 transition-colors focus:border-indigo-400/60 focus:bg-white/[0.06] focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.1em] text-zinc-500">
                Password
              </span>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={handleRecovery}
                  className="text-[11px] font-medium text-indigo-300 transition-colors hover:text-cyan-300"
                >
                  Forgot password?
                </button>
              )}
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[14px] text-white placeholder:text-zinc-600 transition-colors focus:border-indigo-400/60 focus:bg-white/[0.06] focus:outline-none"
            />
          </label>

          <Button
            type="submit"
            size="lg"
            className="mt-1 w-full"
            loading={pending === "email"}
            disabled={!configured}
          >
            {mode === "signin" ? "Sign in" : "Create account"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={!configured || pending !== null}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
        >
          {pending === "magic" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          Email me a magic link instead
        </button>

        <AnimatePresence>
          {notice && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] text-zinc-300"
            >
              {notice}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="mt-6 flex items-center justify-between border-t border-white/[0.07] pt-4 text-[12.5px]">
          <span className="text-zinc-500">
            {mode === "signin" ? "New to NexusAPK?" : "Already have an account?"}
          </span>
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "signin" ? "signup" : "signin"));
              setNotice(null);
            }}
            className={cn(
              "font-medium text-indigo-300 transition-colors hover:text-cyan-300",
            )}
          >
            {mode === "signin" ? "Create account" : "Sign in"}
          </button>
        </div>
      </GlassCard>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11.5px] text-zinc-600">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70" />
        Your APKs stay private to your account.
      </p>
    </motion.div>
  );
}
