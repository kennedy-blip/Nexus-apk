"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceSimulator } from "@/lib/playground/simulator";
import {
  encodeFrame,
  type ControlFrame,
  type StreamStatus,
} from "@/lib/playground/protocol";

interface Options {
  sessionId: string;
  streamUrl: string | null;
  wsUrl: string | null;
  appName: string;
  packageName: string | null;
  /** force the local simulator regardless of transport */
  simulate: boolean;
}

/**
 * Owns the transport for a single session.
 *
 * - `webrtc`: attaches the remote MediaStream to a <video> element and pushes
 *   control frames over the WebSocket bridge.
 * - `simulated`: drives the canvas DeviceSimulator with identical frames.
 *
 * Both paths share the same `send()` API so the UI never branches.
 */
export function useDeviceStream({
  sessionId,
  streamUrl,
  wsUrl,
  appName,
  packageName,
  simulate,
}: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameImgRef = useRef<HTMLImageElement | null>(null);
  const simulatorRef = useRef<DeviceSimulator | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const httpRelayRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const queued = useRef<ControlFrame[]>([]);

  const useRemote = !simulate && Boolean(streamUrl);
  /** MJPEG feeds render into an <img>; WebRTC feeds render into a <video>. */
  const isMjpeg = useRemote && Boolean(streamUrl?.includes("/mjpeg"));

  const [status, setStatus] = useState<StreamStatus>({
    mode: simulate || !streamUrl ? "simulated" : "connecting",
    // Nothing has been measured yet — null renders as "—", not a fake 0.
    fps: null,
    latencyMs: null,
    bitrateKbps: null,
  });
  const [rotation, setRotation] = useState(0);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  /* ---------------- simulated renderer ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || useRemote) return;

    const sim = new DeviceSimulator(canvas, {
      appName,
      packageName,
      // The canvas really does render at this cadence, so `fps` is measured.
      // There is no network hop in simulator mode, so latency stays null rather
      // than inventing a plausible-looking number.
      onFrame: ({ fps }) =>
        setStatus((s) => ({
          ...s,
          mode: "simulated",
          fps,
          latencyMs: null,
          bitrateKbps: null,
        })),
    });

    simulatorRef.current = sim;
    sim.start();

    const ro = new ResizeObserver(() => sim.resize());
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      sim.stop();
      simulatorRef.current = null;
    };
  }, [useRemote, appName, packageName, sessionId]);

  /* ---------------- remote transport ---------------- */
  useEffect(() => {
    if (!useRemote || !streamUrl || isMjpeg) return;

    let cancelled = false;

    async function connect() {
      try {
        setStatus((s) => ({ ...s, mode: "connecting" }));

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = (event) => {
          const [stream] = event.streams;
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => undefined);
          }
        };

        pc.onconnectionstatechange = () => {
          if (cancelled) return;
          if (pc.connectionState === "connected") {
            setStatus((s) => ({ ...s, mode: "webrtc" }));
          } else if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setStatus((s) => ({
              ...s,
              mode: "disconnected",
              message: "Stream lost — attempting to reattach",
            }));
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // The bridge answers out-of-band over the signalling channel.
        const res = await fetch(streamUrl as string, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sdp: offer.sdp, type: offer.type, sessionId }),
        });

        if (!res.ok) throw new Error(`Signalling failed (${res.status})`);
        const answer = (await res.json()) as { sdp: string; type: RTCSdpType };
        await pc.setRemoteDescription(answer);
      } catch (err) {
        if (cancelled) return;
        setStatus((s) => ({
          ...s,
          mode: "disconnected",
          message: err instanceof Error ? err.message : "Stream unavailable",
        }));
      }
    }

    void connect();

    return () => {
      cancelled = true;
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [useRemote, streamUrl, sessionId, isMjpeg]);

  /* ---------------- MJPEG transport ---------------- */
  useEffect(() => {
    if (!isMjpeg) return;
    setStatus((s) => ({ ...s, mode: "connecting" }));
    // The <img> reports load per stream start; browsers keep the multipart
    // connection open so the first load is a good "connected" signal.
    const img = frameImgRef.current;
    if (!img) return;

    if (img.getAttribute("src") !== streamUrl) img.src = streamUrl as string;

    // Count real frame arrivals to derive fps. An MJPEG <img> fires `load` once
    // per part, so this is a genuine measurement rather than a hardcoded value.
    let frames = 0;
    let windowStart = performance.now();

    const onLoad = () => {
      frames += 1;
      const now = performance.now();
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        const measured = Math.round((frames * 1000) / elapsed);
        frames = 0;
        windowStart = now;
        setStatus((s) => ({
          ...s,
          mode: "webrtc",
          message: undefined,
          fps: measured,
          // One-way capture latency is not observable from an <img>; the input
          // round-trip measured by the control relay is the honest number.
          latencyMs: httpRelayRef.current ? null : s.latencyMs,
        }));
        return;
      }

      setStatus((s) =>
        s.mode === "webrtc" && s.fps !== null
          ? s
          : { ...s, mode: "webrtc", message: undefined },
      );
    };
    const onError = () =>
      setStatus((s) => ({
        ...s,
        mode: "disconnected",
        message: "Frame feed unavailable",
      }));

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, [isMjpeg, streamUrl]);

  /* ---------------- control socket ---------------- */
  useEffect(() => {
    if (!useRemote || !wsUrl) return;

    // Same-origin proxy mode: `/api/stream/:id/control` is an HTTP relay, not a
    // WebSocket, because route handlers cannot accept upgrades.
    if (wsUrl.startsWith("/api/")) {
      httpRelayRef.current = wsUrl;
      return () => {
        httpRelayRef.current = null;
      };
    }

    try {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        // flush anything sent while the socket was still opening
        queued.current.forEach((frame) => socket.send(encodeFrame(frame)));
        queued.current = [];
      };

      socket.onclose = () => {
        socketRef.current = null;
      };

      return () => {
        socket.close();
        socketRef.current = null;
      };
    } catch {
      return;
    }
  }, [useRemote, wsUrl]);

  /* ---------------- public API ---------------- */
  const send = useCallback((frame: ControlFrame) => {
    // HTTP relay path (same-origin proxy): one small POST per gesture.
    // Intermediate `move` frames are dropped — adb has no streaming touch API
    // and they would triple the request count for no fidelity gain.
    const relay = httpRelayRef.current;
    if (relay) {
      if (frame.type === "touch" && frame.action === "move") {
        simulatorRef.current?.handleFrame(frame);
        return;
      }
      // Measure the real round-trip of the control POST. This is the honest
      // latency figure for proxied sessions — there is no fake fallback.
      const started = performance.now();
      void fetch(relay, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(frame),
        keepalive: true,
      })
        .then((res) => {
          if (!res.ok) return;
          const rtt = Math.round(performance.now() - started);
          setStatus((s) => ({ ...s, latencyMs: rtt }));
        })
        .catch(() => undefined);
      simulatorRef.current?.handleFrame(frame);
      return;
    }

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(encodeFrame(frame));
    } else if (socket && socket.readyState === WebSocket.CONNECTING) {
      queued.current.push(frame);
    }
    simulatorRef.current?.handleFrame(frame);
  }, []);

  const rotate = useCallback(() => {
    send({ type: "command", action: "rotate" });
    setRotation((r) => (r + 1) % 4);
  }, [send]);

  const capture = useCallback(async (): Promise<string | null> => {
    // Prefer the real framebuffer when streaming, otherwise snapshot the canvas.
    const video = videoRef.current;
    if (video && video.videoWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const url = canvas.toDataURL("image/png");
      setScreenshot(url);
      return url;
    }

    const img = frameImgRef.current;
    if (img && img.naturalWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const url = canvas.toDataURL("image/png");
      setScreenshot(url);
      return url;
    }

    const target = canvasRef.current;
    if (target) {
      const url = target.toDataURL("image/png");
      setScreenshot(url);
      return url;
    }
    return null;
  }, []);

  return {
    videoRef,
    canvasRef,
    frameImgRef,
    isMjpeg,
    status,
    rotation,
    screenshot,
    setScreenshot,
    send,
    rotate,
    capture,
    /** true when frames are rendered locally */
    isSimulated: !useRemote || status.mode === "simulated",
    /** true when the local simulator can accept hardware button commands */
    hasLocalDevice: !useRemote,
  };
}
