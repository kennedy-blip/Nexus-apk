"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PHRASE = "delete my account";

/**
 * Irreversible action guarded by a typed confirmation — cheap protection
 * against a stray click destroying someone's whole library.
 */
export function DangerZone() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [pending, setPending] = useState(false);

  const confirmed = phrase.trim().toLowerCase() === PHRASE;

  async function destroy() {
    setPending(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        message?: string;
        partial?: boolean;
      };

      if (!res.ok) {
        toast.error("Deletion failed", body.error ?? body.detail ?? "Please try again.");
        return;
      }

      toast.success(
        body.partial ? "Data deleted" : "Account deleted",
        body.message ?? "Everything associated with your account was removed.",
      );
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Network error", "Could not reach the account API.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.04] p-5">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-rose-200">
        <AlertTriangle className="h-3.5 w-3.5" />
        Danger zone
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-400">
        Deleting your account removes every saved inspection, your profile and
        your sign-in. This cannot be undone.
      </p>

      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(true)}
            className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2 text-[12.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/20"
          >
            Delete account…
          </motion.button>
        ) : (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[11.5px] text-zinc-400">
                Type <code className="font-mono text-rose-200">{PHRASE}</code> to confirm
              </span>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={PHRASE}
                autoComplete="off"
                className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 font-mono text-[12.5px] text-white placeholder:text-zinc-600 focus:border-rose-400/50 focus:outline-none"
              />
            </label>

            <div className="mt-3 flex gap-2">
              <button
                onClick={destroy}
                disabled={!confirmed || pending}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                  confirmed
                    ? "bg-rose-500/90 text-white hover:bg-rose-500"
                    : "cursor-not-allowed bg-white/[0.04] text-zinc-500",
                )}
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {pending ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setPhrase("");
                }}
                className="rounded-xl px-3 py-2 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
