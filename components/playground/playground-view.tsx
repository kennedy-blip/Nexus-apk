"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Cpu,
  Download,
  Gauge,
  Keyboard,
  Power,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { DeviceFrame } from "@/components/playground/device-frame";
import { ControlToolbar } from "@/components/playground/control-toolbar";
import { SessionConsole } from "@/components/playground/session-console";
import { StatusPill } from "@/components/ui/status-pill";
import { useDeviceStream } from "@/hooks/use-device-stream";
import { useToast } from "@/components/ui/toast";
import { cn, formatBytes } from "@/lib/utils";
import { DEVICE_PROFILES, type ApkRecord, type SessionEvent, type SessionRecord } from "@/lib/types";
import type { ControlFrame } from "@/lib/playground/protocol";

interface Props {
  session: SessionRecord;
  apk: ApkRecord;
  initialEvents: SessionEvent[];
  /**
   * Demo mode: no API calls, no Supabase writes. The device, gestures,
   * keyboard bridge, screenshots and teardown all still work.
   */
  demo?: boolean;
}

const POLL_MS = 4000;
const HEARTBEAT_MS = 60_000;

export function PlaygroundView({ session, apk, initialEvents, demo = false }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [state, setState] = useState<SessionRecord>(session);
  const [events, setEvents] = useState<SessionEvent[]>(initialEvents);
  const [deviceProfile, setDeviceProfile] = useState(session.device_profile);
  const [fullscreen, setFullscreen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [typed, setTyped] = useState("");
  const [soundOn, setSoundOn] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const simulated = state.simulated || !state.stream_url;
  const online = ["running", "installing", "provisioning"].includes(state.state);

  const stream = useDeviceStream({
    sessionId: state.id,
    streamUrl: state.stream_url,
    wsUrl: state.ws_url,
    appName: apk.display_name,
    packageName: apk.package_name,
    simulate: simulated,
  });

  /* ---------------- session polling ---------------- */
  useEffect(() => {
    if (demo) return;
    if (!["provisioning", "installing", "running"].includes(state.state)) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/session/${state.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { session: SessionRecord };
        setState(body.session);
      } catch {
        /* transient network error — keep the last known state */
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [state.id, state.state, demo]);

  /* ---------------- heartbeat + logs ---------------- */
  const lastEventId = events.at(-1)?.id ?? 0;

  useEffect(() => {
    if (demo || state.state !== "running") return;

    const beat = setInterval(() => {
      void fetch(`/api/session/${state.id}/heartbeat`, { method: "POST" }).catch(
        () => undefined,
      );
    }, HEARTBEAT_MS);

    return () => clearInterval(beat);
  }, [state.id, state.state, demo]);

  useEffect(() => {
    if (demo) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/session/${state.id}/events?after=${lastEventId}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { events: SessionEvent[] };
        if (body.events.length) {
          setEvents((prev) => [...prev, ...body.events].slice(-250));
        }
      } catch {
        /* ignore */
      }
    }, POLL_MS + 1500);

    return () => clearInterval(timer);
  }, [state.id, lastEventId, demo]);

  /* ---------------- timer ---------------- */
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(state.expires_at).getTime() - Date.now()) / 1000)),
  );
  const [uptime, setUptime] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(state.started_at).getTime()) / 1000)),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(
        Math.max(0, Math.floor((new Date(state.expires_at).getTime() - Date.now()) / 1000)),
      );
      setUptime(
        Math.max(0, Math.floor((Date.now() - new Date(state.started_at).getTime()) / 1000)),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [state.expires_at, state.started_at]);

  /* ---------------- keyboard forwarding ---------------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key.length === 1) {
        stream.send({ type: "key", text: e.key });
        setTyped((t) => (t + e.key).slice(-24));
      } else if (e.key === "Enter") {
        stream.send({ type: "key", keyCode: 66 });
      } else if (e.key === "Backspace") {
        setTyped((t) => t.slice(0, -1));
        stream.send({ type: "key", keyCode: 67 });
      } else if (e.key === "Escape") {
        stream.send({ type: "command", action: "back" });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stream]);

  /* ---------------- fullscreen ---------------- */
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await frameRef.current?.parentElement?.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen((v) => !v); // fall back to the CSS-only zoom state
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* ---------------- actions ---------------- */
  const onFrame = useCallback(
    (frame: ControlFrame) => stream.send(frame),
    [stream],
  );

  const onHardware = useCallback(
    (action: "power" | "volume-up" | "volume-down") => {
      stream.send({ type: "command", action });
      if (action === "power") stream.send({ type: "command", action: "home" });
      if (action === "volume-up") setSoundOn(true);
      if (action === "volume-down") setSoundOn(false);
    },
    [stream],
  );

  const snapshot = useCallback(async () => {
    const url = await stream.capture();
    if (!url) {
      toast.error("Screenshot failed", "No framebuffer available yet.");
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = `${apk.display_name.replace(/\s+/g, "-")}-${Date.now()}.png`;
    link.click();
    toast.success("Screenshot saved", "Captured to your downloads folder.");
    stream.send({ type: "command", action: "screenshot" });
  }, [apk.display_name, stream, toast]);

  const stopSession = useCallback(async () => {
    if (demo) {
      toast.info("Demo mode", "Sessions here are ephemeral — nothing to tear down.");
      router.push("/demo");
      return;
    }
    setStopping(true);
    try {
      const res = await fetch(`/api/session/${state.id}/stop`, { method: "POST" });
      const body = (await res.json()) as { session?: SessionRecord; error?: string };
      if (!res.ok || !body.session) {
        toast.error("Could not end session", body.error);
        return;
      }
      setState(body.session);
      toast.success("Session ended", "The container was destroyed and storage purged.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error", "Failed to reach the session API.");
    } finally {
      setStopping(false);
    }
  }, [demo, router, state.id, toast]);

  const changeDevice = useCallback(
    (profile: typeof deviceProfile) => {
      setDeviceProfile(profile);
      const spec = DEVICE_PROFILES[profile];
      toast.info(
        `Viewport: ${spec.label}`,
        `${spec.width}×${spec.height} @ ${spec.dpi} dpi`,
      );
    },
    [toast],
  );

  const spec = useMemo(() => DEVICE_PROFILES[deviceProfile], [deviceProfile]);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ---------------- top bar ---------------- */}
      <header className="z-40 flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-[#09090b]/70 px-4 py-3 backdrop-blur-xl sm:px-6">
        <Link
          href={demo ? "/demo" : "/dashboard"}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {demo ? "Demo" : "Library"}
        </Link>

        <span className="hidden h-5 w-px bg-white/10 sm:block" />

        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/10">
            {apk.icon_path ? (
              <img
                src={`/api/assets?path=${encodeURIComponent(apk.icon_path)}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-cyan-500 text-[12px] font-semibold text-white">
                {apk.display_name.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold leading-tight text-white">
              {apk.display_name}
            </p>
            <p className="truncate font-mono text-[10.5px] text-zinc-500">
              {apk.package_name ?? "unknown package"} · {formatBytes(apk.size_bytes)}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <StatusPill state={state.state} />
          <span className="hidden rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1 font-mono text-[10.5px] text-zinc-500 md:block">
            {simulated ? "simulator" : `adb :${state.adb_port ?? "?"}`}
          </span>
        </div>
      </header>

      {/* ---------------- workspace ---------------- */}
      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem] sm:p-6">
        <section className="flex min-h-0 flex-col items-center gap-5">
          <DeviceFrame
            ref={frameRef}
            spec={spec}
            rotation={stream.rotation}
            isSimulated={stream.isSimulated}
            isMjpeg={stream.isMjpeg}
            videoRef={stream.videoRef}
            canvasRef={stream.canvasRef}
            frameImgRef={stream.frameImgRef}
            onFrame={onFrame}
            onHardware={onHardware}
            statusLabel={
              state.state === "failed"
                ? "Session failed to start"
                : "Provisioning cloud device…"
            }
            online={online}
          />

          <ControlToolbar
            remaining={remaining}
            rotation={stream.rotation}
            fullscreen={fullscreen}
            deviceProfile={deviceProfile}
            onRotate={stream.rotate}
            onScreenshot={snapshot}
            onToggleFullscreen={toggleFullscreen}
            onInstall={() => router.push(demo ? "/demo" : "/dashboard")}
            onChangeDevice={changeDevice}
            onStop={stopSession}
            stopping={stopping}
          />

          <p className="max-w-md text-center text-[11px] leading-relaxed text-zinc-600">
            Click and drag to swipe · type to send keys · Esc maps to Back.{" "}
            {simulated
              ? "Running the built-in browser simulator — connect an orchestrator for real redroid streaming."
              : "Frames arrive over WebRTC; input travels on the WebSocket bridge."}
          </p>
        </section>

        {/* ---------------- side rail ---------------- */}
        <aside className="flex min-h-0 flex-col gap-3">
          {/* telemetry */}
          <div className="glass rounded-2xl p-3">
            <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              Telemetry
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Metric icon={Gauge} label="FPS" value={stream.status.fps.toString()} />
              <Metric
                icon={Cpu}
                label="Latency"
                value={`${stream.status.latencyMs}ms`}
              />
              <Metric
                icon={soundOn ? Volume2 : VolumeX}
                label="Audio"
                value={soundOn ? "on" : "off"}
              />
            </div>
          </div>

          {/* hardware buttons */}
          <div className="glass rounded-2xl p-3">
            <p className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              Hardware
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              <HardwareButton
                label="Power"
                onClick={() => onHardware("power")}
                icon={Power}
              />
              <HardwareButton
                label="Vol +"
                onClick={() => onHardware("volume-up")}
                icon={Volume2}
              />
              <HardwareButton
                label="Vol −"
                onClick={() => onHardware("volume-down")}
                icon={VolumeX}
              />
              <HardwareButton
                label="Home"
                onClick={() => stream.send({ type: "command", action: "home" })}
                icon={Keyboard}
              />
            </div>
          </div>

          {/* typed buffer */}
          <div className="glass rounded-2xl p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Keyboard bridge
              </p>
              <button
                onClick={() => setTyped("")}
                className="text-[10px] text-zinc-500 transition-colors hover:text-white"
              >
                clear
              </button>
            </div>
            <div className="min-h-[2.25rem] rounded-lg border border-white/[0.07] bg-black/30 px-2.5 py-1.5 font-mono text-[11.5px] text-indigo-200">
              {typed || <span className="text-zinc-600">start typing…</span>}
              <span className="ml-0.5 inline-block h-3 w-[1.5px] animate-pulse bg-indigo-300 align-middle" />
            </div>
          </div>

          <div className="min-h-[9rem] flex-1">
            <SessionConsole
              events={events}
              uptime={uptime}
              connected={state.state === "running"}
            />
          </div>

          {demo ? (
            <div className="glass-subtle flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11.5px] text-amber-200/80">
              <Sparkles className="h-3.5 w-3.5" />
              Demo data — no storage signed
            </div>
          ) : (
            <a
              href={`/api/apks/${apk.id}`}
              target="_blank"
              rel="noreferrer"
              className="glass-subtle inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Get signed APK URL
            </a>
          )}
        </aside>
      </div>

      {/* ---------------- screenshot preview ---------------- */}
      <AnimatePresence>
        {stream.screenshot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-6 backdrop-blur-md"
            onClick={() => stream.setScreenshot(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="glass-strong relative max-h-[85dvh] overflow-hidden rounded-2xl p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => stream.setScreenshot(null)}
                className="absolute right-3 top-3 z-10 rounded-lg bg-black/60 p-1.5 text-zinc-300 transition-colors hover:text-white"
                aria-label="Close screenshot"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={stream.screenshot}
                alt="Device screenshot"
                className="max-h-[78dvh] w-auto rounded-xl"
              />
              <div className="flex items-center justify-between px-2 py-2">
                <span className="flex items-center gap-1.5 text-[11.5px] text-emerald-300">
                  <Check className="h-3.5 w-3.5" /> Captured
                </span>
                <a
                  href={stream.screenshot}
                  download={`${apk.display_name.replace(/\s+/g, "-")}.png`}
                  className={cn(
                    "rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11.5px] text-white transition-colors hover:bg-white/[0.12]",
                  )}
                >
                  Download PNG
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-2">
      <Icon className="mb-1 h-3 w-3 text-zinc-500" />
      <p className="font-mono text-[13px] leading-none text-white tabular-nums">{value}</p>
      <p className="mt-1 text-[9.5px] uppercase tracking-[0.1em] text-zinc-600">{label}</p>
    </div>
  );
}

function HardwareButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.025] px-1 py-2 text-zinc-400 transition-all hover:border-indigo-400/30 hover:bg-white/[0.07] hover:text-white active:scale-95"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-[9.5px]">{label}</span>
    </button>
  );
}
