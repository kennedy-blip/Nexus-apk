"use client";

import { forwardRef, useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { DeviceSpec } from "@/lib/types";
import {
  buildSwipe,
  toDeviceSpace,
  type ControlFrame,
} from "@/lib/playground/protocol";

interface Props {
  spec: DeviceSpec;
  rotation: number;
  /** live mode renders the <video>; simulated renders the <canvas> */
  isSimulated: boolean;
  isMjpeg?: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  frameImgRef?: React.RefObject<HTMLImageElement | null>;
  onFrame: (frame: ControlFrame) => void;
  onHardware: (action: "power" | "volume-up" | "volume-down") => void;
  statusLabel: string;
  online: boolean;
}

/**
 * The physical device: metal frame, dynamic island, hardware rails and a
 * pointer-capture surface that converts mouse/touch into Android input.
 */
export const DeviceFrame = forwardRef<HTMLDivElement, Props>(function DeviceFrame(
  {
    spec,
    rotation,
    isSimulated,
    isMjpeg = false,
    videoRef,
    canvasRef,
    frameImgRef,
    onFrame,
    onHardware,
    statusLabel,
    online,
  },
  ref,
) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const [pressing, setPressing] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; k: number } | null>(null);
  const rotated = rotation % 2 === 1;

  const rectOf = () => surfaceRef.current?.getBoundingClientRect() ?? new DOMRect();

  const down = useCallback(
    (e: React.PointerEvent) => {
      // Ignore secondary buttons so right-click stays available for the OS menu.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const rect = rectOf();
      const { x, y } = toDeviceSpace(e.clientX, e.clientY, rect);
      drag.current = { x, y, t: performance.now(), moved: false };
      setPressing(true);
      setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, k: Date.now() });
      onFrame({ type: "touch", action: "down", x, y, pressure: 1 });
    },
    [onFrame],
  );

  const move = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      const rect = rectOf();
      const { x, y } = toDeviceSpace(e.clientX, e.clientY, rect);
      if (Math.hypot(x - drag.current.x, y - drag.current.y) > 0.012) {
        drag.current.moved = true;
      }
      onFrame({ type: "touch", action: "move", x, y, pressure: 1 });
    },
    [onFrame],
  );

  const up = useCallback(
    (e: React.PointerEvent) => {
      const start = drag.current;
      drag.current = null;
      setPressing(false);
      if (!start) return;

      const rect = rectOf();
      const { x, y } = toDeviceSpace(e.clientX, e.clientY, rect);
      const end = { x, y, t: performance.now() };

      onFrame({ type: "touch", action: "up", x, y, pressure: 0 });

      if (start.moved) {
        // Long-ish drags become an explicit swipe so the device scrolls
        // natively rather than relying on synthetic momentum.
        onFrame(buildSwipe(start, end));
      }
    },
    [onFrame],
  );

  const cancel = useCallback(() => {
    drag.current = null;
    setPressing(false);
    onFrame({ type: "touch", action: "cancel", x: 0, y: 0, pressure: 0 });
  }, [onFrame]);

  return (
    <div ref={ref} className="relative flex items-center justify-center">
      {/* aura */}
      <div
        aria-hidden
        className="device-aura pointer-events-none absolute h-[85%] w-[85%] rounded-full opacity-40 blur-3xl"
      />

      <motion.div
        layout
        animate={{ rotate: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 22 }}
        className="relative"
        style={{ perspective: 1400 }}
      >
        <div
          className={cn(
            "device-shell relative p-[10px] transition-[width,height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            spec.id === "tablet" ? "rounded-[2.2rem]" : "rounded-[2.9rem]",
          )}
          style={{
            width: rotated
              ? `min(78vw, calc((100dvh - 15rem) * ${spec.height / spec.width}))`
              : `min(88vw, 23rem)`,
          }}
        >
          {/* hardware rails */}
          <span className="absolute -left-[3px] top-[22%] h-9 w-[3px] rounded-l bg-zinc-700/80" />
          <button
            aria-label="Volume up"
            onClick={() => onHardware("volume-up")}
            className="absolute -left-[3px] top-[32%] h-14 w-[3px] cursor-pointer rounded-l bg-zinc-600/90 transition-colors hover:bg-indigo-400/80"
          />
          <button
            aria-label="Volume down"
            onClick={() => onHardware("volume-down")}
            className="absolute -left-[3px] top-[44%] h-14 w-[3px] cursor-pointer rounded-l bg-zinc-600/90 transition-colors hover:bg-indigo-400/80"
          />
          <button
            aria-label="Power"
            onClick={() => onHardware("power")}
            className="absolute -right-[3px] top-[34%] h-16 w-[3px] cursor-pointer rounded-r bg-zinc-600/90 transition-colors hover:bg-indigo-400/80"
          />

          {/* screen */}
          <div
            className={cn(
              "device-screen device-gloss relative overflow-hidden",
              spec.id === "tablet" ? "rounded-[1.7rem]" : "rounded-[2.35rem]",
            )}
            style={{ aspectRatio: rotated ? `${spec.height} / ${spec.width}` : `${spec.width} / ${spec.height}` }}
          >
            {/* dynamic island / notch */}
            {spec.notch === "punch" && !rotated && (
              <div className="pointer-events-none absolute left-1/2 top-2 z-30 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-black/90 ring-1 ring-white/[0.06]">
                <span className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#111827] ring-1 ring-white/10">
                  <span className="absolute inset-[3px] rounded-full bg-[#0b1220]" />
                </span>
              </div>
            )}

            {/* input surface */}
            <div
              ref={surfaceRef}
              role="application"
              aria-label={`${spec.label} interactive screen`}
              tabIndex={0}
              className={cn(
                "absolute inset-0 z-20 touch-none select-none outline-none",
                pressing ? "cursor-grabbing" : "cursor-grab",
              )}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
              onPointerLeave={(e) => {
                if (drag.current && e.buttons === 0) cancel();
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {!online && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#06070a]/92 backdrop-blur-sm">
                  <div className="relative h-10 w-10">
                    <span className="absolute inset-0 animate-ping rounded-full border border-indigo-400/40" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-indigo-400" />
                    </span>
                  </div>
                  <p className="text-[12.5px] font-medium text-zinc-300">{statusLabel}</p>
                </div>
              )}

              {/* click ripple */}
              {ripple && (
                <motion.span
                  key={ripple.k}
                  initial={{ opacity: 0.5, scale: 0.2 }}
                  animate={{ opacity: 0, scale: 1.6 }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                  onAnimationComplete={() => setRipple(null)}
                  className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/70 bg-cyan-300/10"
                  style={{ left: ripple.x, top: ripple.y }}
                />
              )}
            </div>

            {/* renderers */}
            {isSimulated ? (
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
                aria-hidden
              />
            ) : isMjpeg ? (
              // MJPEG multipart feed: browsers render it natively in <img>.
              <img
                ref={frameImgRef}
                alt="Live Android device stream"
                className="absolute inset-0 h-full w-full bg-black object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full bg-black object-contain"
                aria-label="Live Android device stream"
              />
            )}

            {/* screen glare */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-[linear-gradient(118deg,rgba(255,255,255,0.10),transparent_38%,transparent_72%,rgba(255,255,255,0.05))]"
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
});
