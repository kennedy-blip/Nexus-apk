"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceSimulator } from "@/lib/playground/simulator";
import {
  encodeFrame,
  type ControlFrame,
  type StreamMode,
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
  const simulatorRef = useRef<DeviceSimulator | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const queued = useRef<ControlFrame[]>([]);

  const useRemote = !simulate && Boolean(streamUrl);

  const [status, setStatus] = useState<StreamStatus>({
    mode: simulate || !streamUrl ? "simulated" : "connecting",
    fps: 0,
    latencyMs: 0,
    bitrateKbps: 0,
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
      onFrame: ({ fps }) =>
        setStatus((s) => ({
          ...s,
          mode: "simulated",
          fps,
          // deterministic-but-plausible numbers for the HUD
          latencyMs: 8 + ((fps * 7) % 9),
          bitrateKbps: 0,
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
    if (!useRemote || !streamUrl) return;

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
  }, [useRemote, streamUrl, sessionId]);

  /* ---------------- control socket ---------------- */
  useEffect(() => {
    if (!useRemote || !wsUrl) return;

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
