/**
 * Wire protocol between the browser workspace and the streaming bridge.
 *
 * The bridge (scrcpy-web / ws-scrcpy style) accepts JSON control frames and
 * forwards them to `adb shell input`. Coordinates are normalised 0..1 so the
 * client never needs to know the emulated display resolution or DPI.
 */

export type PointerAction = "down" | "move" | "up" | "cancel";

export interface TouchFrame {
  type: "touch";
  action: PointerAction;
  /** normalised 0..1 */
  x: number;
  y: number;
  /** 0..1, mapped to MotionEvent pressure */
  pressure?: number;
  pointerId?: number;
}

export interface SwipeFrame {
  type: "swipe";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** milliseconds */
  duration: number;
}

export interface KeyFrame {
  type: "key";
  /** android keycode or literal text */
  text?: string;
  keyCode?: number;
}

export interface CommandFrame {
  type: "command";
  action: "rotate" | "screenshot" | "power" | "volume-up" | "volume-down" | "home" | "back" | "recents";
}

export type ControlFrame = TouchFrame | SwipeFrame | KeyFrame | CommandFrame;

export type StreamMode = "webrtc" | "simulated" | "connecting" | "disconnected";

export interface StreamStatus {
  mode: StreamMode;
  /** measured frames per second; null when nothing is being measured */
  fps: number | null;
  /** measured round-trip in ms; null when there is no network transport */
  latencyMs: number | null;
  bitrateKbps: number | null;
  message?: string;
}

export const ANDROID_KEYS = {
  HOME: 3,
  BACK: 4,
  POWER: 26,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  APP_SWITCH: 187,
  ENTER: 66,
  DEL: 67,
} as const;

/** Serialises a control frame for the WebSocket bridge. */
export function encodeFrame(frame: ControlFrame): string {
  return JSON.stringify(frame);
}

/**
 * Maps a pointer position inside the rendered viewport to normalised device
 * coordinates, clamped so drags that leave the frame stay in range.
 */
export function toDeviceSpace(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  const x = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
  const y = rect.height === 0 ? 0 : (clientY - rect.top) / rect.height;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

/** Converts a drag into a swipe gesture with a sane duration. */
export function buildSwipe(
  start: { x: number; y: number; t: number },
  end: { x: number; y: number; t: number },
): SwipeFrame {
  return {
    type: "swipe",
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    duration: Math.min(1200, Math.max(60, Math.round(end.t - start.t))),
  };
}
