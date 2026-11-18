"use client";

import { motion } from "framer-motion";
import {
  Camera,
  ChevronDown,
  Maximize2,
  Minimize2,
  PlugZap,
  RotateCw,
  Timer,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { DeviceProfile } from "@/lib/types";

interface Props {
  /** null when the session has no lease (signed-in users are unrestricted) */
  remaining: number | null;
  /** elapsed seconds, shown when there is no lease to count down */
  uptime: number;
  rotation: number;
  fullscreen: boolean;
  deviceProfile: DeviceProfile;
  onRotate: () => void;
  onScreenshot: () => void;
  onToggleFullscreen: () => void;
  onInstall: () => void;
  onChangeDevice: (profile: DeviceProfile) => void;
  onStop: () => void;
  stopping: boolean;
}

const devices: { id: DeviceProfile; label: string }[] = [
  { id: "phone", label: "Phone" },
  { id: "phone-xl", label: "Phone XL" },
  { id: "tablet", label: "Tablet" },
];

/** Floating glass pill with the primary session actions. */
export function ControlToolbar({
  remaining,
  uptime,
  fullscreen,
  deviceProfile,
  onRotate,
  onScreenshot,
  onToggleFullscreen,
  onInstall,
  onChangeDevice,
  onStop,
  stopping,
}: Props) {
  const leased = remaining !== null;
  const urgent = leased && remaining <= 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.1 }}
      className="glass-strong relative z-30 flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-1 rounded-2xl px-2 py-1.5 shadow-2xl"
    >
      <ToolButton label="Rotate" onClick={onRotate}>
        <RotateCw className="h-4 w-4" />
      </ToolButton>

      <ToolButton label="Screenshot" onClick={onScreenshot}>
        <Camera className="h-4 w-4" />
      </ToolButton>

      <ToolButton
        label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        onClick={onToggleFullscreen}
      >
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </ToolButton>

      <ToolButton label="Install APK" onClick={onInstall}>
        <PlugZap className="h-4 w-4" />
      </ToolButton>

      <span className="mx-1 h-6 w-px bg-white/10" />

      {/* device selector */}
      <div className="group relative">
        <button className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white">
          {devices.find((d) => d.id === deviceProfile)?.label ?? "Phone"}
          <ChevronDown className="h-3 w-3 text-zinc-500" />
        </button>
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-32 -translate-x-1/2 rounded-xl border border-white/10 bg-[#0d0d13]/95 p-1 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => onChangeDevice(d.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px] transition-colors",
                d.id === deviceProfile
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {d.label}
              {d.id === deviceProfile && (
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      <span className="mx-1 h-6 w-px bg-white/10" />

      {/* session clock: a lease counts down, an unrestricted session counts up */}
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-mono text-[12px] tabular-nums",
          urgent ? "bg-rose-500/15 text-rose-300" : "bg-white/[0.04] text-zinc-300",
        )}
        title={
          leased
            ? "Session time remaining on this lease"
            : "Session uptime — this session does not expire"
        }
      >
        <Timer className={cn("h-3.5 w-3.5", urgent ? "text-rose-300" : "text-zinc-500")} />
        {leased ? formatDuration(remaining) : formatDuration(uptime)}
        {!leased && <span className="text-[10px] uppercase tracking-wider text-emerald-300/80">live</span>}
      </span>

      <button
        onClick={onStop}
        disabled={stopping}
        className="ml-1 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-[12px] font-medium text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
      >
        {stopping ? "Ending…" : "End session"}
      </button>
    </motion.div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="group relative rounded-xl p-2 text-zinc-300 transition-all hover:bg-white/[0.09] hover:text-white active:scale-95"
    >
      {children}
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#0d0d13]/95 px-2 py-1 text-[10.5px] text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}
