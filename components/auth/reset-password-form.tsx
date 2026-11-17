"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

export function ResetPasswordForm() {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strongEnough = password.length >= 8;
  const matches = password.length > 0 && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!strongEnough) {
      setError("Use at least 8 characters.");
      return;
    }
    if (!matches) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    toast.success("Password updated", "You can now sign in with the new password.");
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 900);
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
        <GlassCard variant="strong" edge className="w-full max-w-sm p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-400" />
          <h1 className="text-[18px] font-semibold text-white">Password updated</h1>
          <p className="mt-1.5 text-[13px] text-zinc-400">Taking you to your workspace…</p>
          <Loader2 className="mx-auto mt-4 h-4 w-4 animate-spin text-indigo-300" />
        </GlassCard>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
      className="w-full max-w-[25rem]"
    >
      <GlassCard variant="strong" edge sheen className="p-7">
        <h1 className="text-[20px] font-semibold tracking-tight text-white">
          Set a new password
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
          Choose something you have not used elsewhere. Sessions on other devices
          stay signed in.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-zinc-500">
              New password
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[14px] text-white placeholder:text-zinc-600 transition-colors focus:border-indigo-400/60 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-zinc-500">
              Confirm password
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[14px] text-white placeholder:text-zinc-600 transition-colors focus:border-indigo-400/60 focus:outline-none"
            />
          </label>

          {/* live strength hints, no jarring layout shift */}
          <ul className="space-y-1 pt-1 text-[11.5px]">
            <li className={strongEnough ? "text-emerald-300" : "text-zinc-500"}>
              {strongEnough ? "✓" : "○"} At least 8 characters
            </li>
            <li className={matches ? "text-emerald-300" : "text-zinc-500"}>
              {matches ? "✓" : "○"} Passwords match
            </li>
          </ul>

          {error && (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={pending}>
            Update password
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </GlassCard>
    </motion.div>
  );
}
