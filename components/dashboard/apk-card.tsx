"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  MoreHorizontal,
  Play,
  Smartphone,
  Trash2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { cn, formatBytes, formatRelativeTime, gradientFor, initials } from "@/lib/utils";
import type { ApkRecord } from "@/lib/types";

export function ApkCard({
  apk,
  launching,
  onLaunch,
  onDelete,
}: {
  apk: ApkRecord;
  launching: boolean;
  onLaunch: (apk: ApkRecord) => void;
  onDelete: (apk: ApkRecord) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [from, to] = gradientFor(apk.package_name ?? apk.display_name);

  return (
    <GlassCard
      interactive
      edge
      className="group flex h-full flex-col p-4"
      onMouseLeave={() => {
        setMenuOpen(false);
        setConfirming(false);
      }}
    >
      <div className="flex items-start gap-3">
        {/* icon */}
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/10 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.9)]">
          {apk.icon_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets?path=${encodeURIComponent(apk.icon_path)}`}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-[15px] font-semibold text-white"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
            >
              {initials(apk.display_name)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold tracking-tight text-white">
            {apk.display_name}
          </h3>
          <p className="truncate font-mono text-[11px] text-zinc-500">
            {apk.package_name ?? "package unknown"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-zinc-500">
            <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-px font-mono">
              {apk.version_name ?? "v?"}
            </span>
            <span>{formatBytes(apk.size_bytes)}</span>
            {apk.min_sdk !== null && <span>minSdk {apk.min_sdk}</span>}
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
            aria-label="App actions"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className="glass-strong absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl p-1 shadow-2xl"
            >
              <a
                href={`/api/apks/${apk.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
                Signed download URL
              </a>
              {confirming ? (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(apk);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg bg-rose-500/15 px-2.5 py-1.5 text-[12.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/25"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirm delete
                </button>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/10 hover:text-rose-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete APK
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="min-w-0 text-[10.5px] leading-relaxed text-zinc-600">
          <p className="flex items-center gap-1">
            <Smartphone className="h-3 w-3" />
            {apk.launch_count} launch{apk.launch_count === 1 ? "" : "es"}
          </p>
          <p className="truncate">
            {apk.last_launched_at
              ? `last ${formatRelativeTime(apk.last_launched_at)}`
              : `added ${formatRelativeTime(apk.created_at)}`}
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => onLaunch(apk)}
          loading={launching}
          className={cn("shrink-0", launching && "pointer-events-none")}
        >
          {!launching && <Play className="h-3 w-3 fill-current" />}
          {launching ? "Booting…" : "Playground"}
        </Button>
      </div>
    </GlassCard>
  );
}
