"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { UploadDropzone } from "@/components/dashboard/upload-dropzone";
import { ApkCard } from "@/components/dashboard/apk-card";
import { ActiveSessionStrip } from "@/components/dashboard/active-session-strip";
import { useApkUpload } from "@/hooks/use-apk-upload";
import { useToast } from "@/components/ui/toast";
import { cn, formatBytes } from "@/lib/utils";
import type { ApkRecord, SessionRecord } from "@/lib/types";

type SortKey = "recent" | "name" | "size";

export function LibraryView({
  initialApks,
  activeSessions,
}: {
  initialApks: ApkRecord[];
  activeSessions: SessionRecord[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [apks, setApks] = useState<ApkRecord[]>(initialApks);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [launching, setLaunching] = useState<string | null>(null);

  const onUploaded = useCallback(
    (apk: ApkRecord) => {
      setApks((prev) => [apk, ...prev.filter((a) => a.id !== apk.id)]);
      toast.success(
        "APK added to library",
        `${apk.display_name}${apk.package_name ? ` · ${apk.package_name}` : ""}`,
      );
      router.refresh();
    },
    [router, toast],
  );

  const { items, addFiles, cancel, dismiss, maxBytes } = useApkUpload(onUploaded);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const { rejections } = await addFiles(files);
      rejections.forEach((r) =>
        toast.error(`Skipped ${r.name}`, r.reason),
      );
    },
    [addFiles, toast],
  );

  const launch = useCallback(
    async (apk: ApkRecord) => {
      setLaunching(apk.id);
      try {
        const res = await fetch("/api/session/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apkId: apk.id }),
        });
        const body = (await res.json()) as {
          session?: SessionRecord;
          error?: string;
          detail?: string;
          simulated?: boolean;
        };

        if (!res.ok || !body.session) {
          toast.error("Could not start device", body.detail ?? body.error);
          return;
        }

        toast.success(
          body.simulated ? "Simulator ready" : "Device provisioning",
          body.simulated
            ? "No orchestrator configured — running the local simulator."
            : "Your redroid container is booting.",
        );
        router.push(`/playground/${body.session.id}`);
      } catch {
        toast.error("Network error", "Could not reach the session API.");
      } finally {
        setLaunching(null);
      }
    },
    [router, toast],
  );

  const remove = useCallback(
    async (apk: ApkRecord) => {
      const snapshot = apks;
      setApks((prev) => prev.filter((a) => a.id !== apk.id));
      const res = await fetch(`/api/apks/${apk.id}`, { method: "DELETE" });
      if (!res.ok) {
        setApks(snapshot);
        toast.error("Delete failed", "The APK could not be removed.");
        return;
      }
      toast.success("APK deleted", `${apk.display_name} and its binaries were purged.`);
      router.refresh();
    },
    [apks, router, toast],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? apks.filter(
          (a) =>
            a.display_name.toLowerCase().includes(q) ||
            (a.package_name ?? "").toLowerCase().includes(q),
        )
      : apks;

    return [...list].sort((a, b) => {
      if (sort === "name") return a.display_name.localeCompare(b.display_name);
      if (sort === "size") return b.size_bytes - a.size_bytes;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [apks, query, sort]);

  const totalBytes = apks.reduce((sum, a) => sum + a.size_bytes, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {/* header */}
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">
            App library
          </h1>
          <p className="mt-1 text-[13.5px] text-zinc-500">
            {apks.length === 0
              ? "Upload your first APK to boot a cloud device."
              : `${apks.length} app${apks.length === 1 ? "" : "s"} · ${formatBytes(totalBytes)} stored`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps or packages"
              className="h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-[13px] text-white placeholder:text-zinc-600 transition-colors focus:border-indigo-400/50 focus:outline-none sm:w-64"
            />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 appearance-none rounded-xl border border-white/10 bg-white/[0.04] pl-8 pr-7 text-[13px] text-zinc-300 transition-colors focus:border-indigo-400/50 focus:outline-none"
            >
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
            <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          </div>
        </div>
      </div>

      {activeSessions.length > 0 && <ActiveSessionStrip sessions={activeSessions} />}

      <UploadDropzone
        onFiles={handleFiles}
        items={items}
        onCancel={cancel}
        onDismiss={dismiss}
        maxBytes={maxBytes}
      />

      {/* grid */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            {query ? `${filtered.length} result${filtered.length === 1 ? "" : "s"}` : "All apps"}
          </h2>
        </div>

        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-subtle flex flex-col items-center rounded-3xl px-6 py-14 text-center"
            >
              <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-500">
                {query ? <Search className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
              </span>
              <p className="text-[14px] font-medium text-zinc-300">
                {query ? "No apps match that search" : "Your library is empty"}
              </p>
              <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-zinc-500">
                {query
                  ? "Try a package identifier like com.example.app."
                  : "Drop an .apk above — we'll parse the manifest, extract the icon and have it streaming in seconds."}
              </p>
              {!query && (
                <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-[11px] text-indigo-200">
                  <Sparkles className="h-3 w-3" />
                  First 30 streaming minutes are free
                </span>
              )}
            </motion.div>
          ) : (
            <motion.div
              layout
              className={cn(
                "grid gap-3",
                "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
              )}
            >
              {filtered.map((apk) => (
                <ApkCard
                  key={apk.id}
                  apk={apk}
                  launching={launching === apk.id}
                  onLaunch={launch}
                  onDelete={remove}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
