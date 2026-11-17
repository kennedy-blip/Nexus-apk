"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Play,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { PlaygroundView } from "@/components/playground/playground-view";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Logo, Wordmark } from "@/components/ui/logo";
import {
  DEMO_APKS,
  demoEvents,
  demoIngest,
  type DemoApk,
} from "@/lib/demo-data";
import { cn, formatBytes, formatRelativeTime, initials } from "@/lib/utils";
import type { ApkRecord, SessionRecord } from "@/lib/types";

/**
 * Self-contained studio tour. Everything below is local state: uploads are
 * simulated ingest (progress still reflects the real file), sessions boot the
 * canvas device, and no request ever leaves the browser.
 */
export function DemoWorkspace() {
  const toast = useToast();
  const [apps, setApps] = useState<DemoApk[]>(DEMO_APKS);
  const [active, setActive] = useState<{ session: SessionRecord; apk: ApkRecord } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [launching, setLaunching] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const accepted = files.filter((f) => f.name.toLowerCase().endsWith(".apk"));
      files
        .filter((f) => !f.name.toLowerCase().endsWith(".apk"))
        .forEach((f) => toast.error(`Skipped ${f.name}`, "Only .apk files are supported."));

      if (!accepted.length) return;

      // Mirror the real uploader's staged progress so the UX matches prod.
      accepted.forEach((file, index) => {
        window.setTimeout(
          () => {
            setApps((prev) => [demoIngest(file), ...prev]);
            toast.success("APK ingested (demo)", `${file.name} · ${formatBytes(file.size)}`);
          },
          700 + index * 250,
        );
      });
    },
    [toast],
  );

  const launch = useCallback(
    (apk: DemoApk) => {
      setLaunching(apk.id);
      window.setTimeout(() => {
        const id = `demo-${Math.random().toString(36).slice(2, 10)}`;
        const startedAt = new Date();
        const session: SessionRecord = {
          id,
          apk_id: apk.id,
          owner_id: "demo",
          backend_session_id: null,
          state: "running",
          device_profile: "phone",
          stream_url: null,
          ws_url: null,
          adb_port: 5612,
          container_id: "nexus-redroid-demo",
          simulated: true,
          error_message: null,
          started_at: startedAt.toISOString(),
          expires_at: new Date(startedAt.getTime() + 15 * 60_000).toISOString(),
          last_heartbeat_at: startedAt.toISOString(),
          ended_at: null,
        };
        setActive({ session, apk: apk as unknown as ApkRecord });
        setLaunching(null);
        toast.info("Demo device booted", "Rendering on the in-browser simulator.");
      }, 900);
    },
    [toast],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.display_name.toLowerCase().includes(q) ||
        (a.package_name ?? "").toLowerCase().includes(q),
    );
  }, [apps, query]);

  if (active) {
    return (
      <PlaygroundView
        demo
        session={active.session}
        apk={active.apk}
        initialEvents={demoEvents(active.session.device_profile)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <Wordmark />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">
            <Sparkles className="h-3 w-3" />
            Demo workspace
          </span>
          <Link href="/login">
            <Button size="sm" variant="secondary">
              Sign in
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">
            App library
          </h1>
          <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-zinc-500">
            This is the full workspace running with local data — upload an APK and
            it boots the interactive device immediately. Connect Supabase +
            the FastAPI orchestrator for real redroid sessions.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps"
            className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-[13px] text-white placeholder:text-zinc-600 transition-colors focus:border-indigo-400/50 focus:outline-none sm:w-56"
          />
        </div>
      </div>

      {/* local-only uploader */}
      <LocalDropzone onFiles={handleFiles} />

      <h2 className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        All apps
      </h2>

      <motion.div layout className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((apk) => (
            <motion.div
              key={apk.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
            >
              <GlassCard interactive edge className="group flex h-full flex-col p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]"
                    style={{
                      background: `linear-gradient(135deg, ${apk.accent[0]}, ${apk.accent[1]})`,
                    }}
                  >
                    {initials(apk.display_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14px] font-semibold tracking-tight text-white">
                      {apk.display_name}
                    </h3>
                    <p className="truncate font-mono text-[11px] text-zinc-500">
                      {apk.package_name}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-zinc-500">
                      <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-px font-mono">
                        {apk.version_name}
                      </span>
                      <span>{formatBytes(apk.size_bytes)}</span>
                      <span>minSdk {apk.min_sdk}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setApps((prev) => prev.filter((a) => a.id !== apk.id));
                      toast.info("Removed from demo library", apk.display_name);
                    }}
                    className="shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all hover:bg-white/10 hover:text-rose-300 group-hover:opacity-100"
                    aria-label={`Remove ${apk.display_name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">{apk.blurb}</p>

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <div className="text-[10.5px] leading-relaxed text-zinc-600">
                    <p>
                      {apk.launch_count} launch{apk.launch_count === 1 ? "" : "es"}
                    </p>
                    <p className="truncate">
                      {apk.last_launched_at
                        ? `last ${formatRelativeTime(apk.last_launched_at)}`
                        : `added ${formatRelativeTime(apk.created_at)}`}
                    </p>
                  </div>
                  <Button size="sm" loading={launching === apk.id} onClick={() => launch(apk)}>
                    {launching !== apk.id && <Play className="h-3 w-3 fill-current" />}
                    {launching === apk.id ? "Booting…" : "Playground"}
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <div className="glass-subtle mt-2 rounded-3xl px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-zinc-300">No apps match “{query}”</p>
          <p className="mt-1 text-[12.5px] text-zinc-500">
            Try the package name, e.g. io.boltrides.app
          </p>
        </div>
      )}
    </div>
  );
}

/** Drag-and-drop surface with staged, local-only progress feedback. */
function LocalDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);

  return (
    <motion.label
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      animate={{
        borderColor: dragging ? "rgba(103,232,249,0.55)" : "rgba(255,255,255,0.10)",
        backgroundColor: dragging ? "rgba(6,182,212,0.07)" : "rgba(255,255,255,0.025)",
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center overflow-hidden rounded-3xl border border-dashed px-8 py-9 text-center backdrop-blur-xl",
      )}
    >
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-gradient-to-br from-indigo-500/25 to-cyan-500/15 text-indigo-200 shadow-[0_0_32px_-8px_rgba(99,102,241,0.9)]">
        <UploadCloud className="h-5 w-5" />
      </span>
      <p className="text-[15px] font-medium text-white">
        {dragging ? "Release to ingest" : "Drop your APK here"}
      </p>
      <p className="mt-1 text-[13px] text-zinc-500">
        Demo ingest · mocked manifest parse · nothing leaves your browser
      </p>
      <input
        type="file"
        accept=".apk,application/vnd.android.package-archive"
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </motion.label>
  );
}
