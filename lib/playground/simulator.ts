/**
 * Canvas-based Android device simulator.
 *
 * This is the demo/offline renderer used when no redroid orchestrator is
 * configured. It is a real state machine — a launcher, an app drawer, gesture
 * navigation, a working clock and a boot sequence — driven entirely by the
 * same normalised touch/key frames the live WebRTC bridge consumes, so the
 * control path can be developed and demoed without GPU hardware.
 *
 * It is intentionally dependency-free (no react) so it can be driven from a
 * requestAnimationFrame loop without triggering React renders at 60fps.
 */

import type { ControlFrame } from "./protocol";

export type SimPoint = { x: number; y: number; t: number };

interface SimApp {
  id: string;
  label: string;
  colors: [string, string];
  glyph: string;
}

const APPS: SimApp[] = [
  { id: "browser", label: "Browser", colors: ["#38bdf8", "#2563eb"], glyph: "◎" },
  { id: "gallery", label: "Gallery", colors: ["#f472b6", "#db2777"], glyph: "▣" },
  { id: "music", label: "Music", colors: ["#fb923c", "#ea580c"], glyph: "♪" },
  { id: "notes", label: "Notes", colors: ["#34d399", "#059669"], glyph: "≡" },
  { id: "maps", label: "Maps", colors: ["#a78bfa", "#7c3aed"], glyph: "◈" },
  { id: "camera", label: "Camera", colors: ["#64748b", "#1e293b"], glyph: "◉" },
  { id: "files", label: "Files", colors: ["#facc15", "#ca8a04"], glyph: "▤" },
  { id: "settings", label: "Settings", colors: ["#94a3b8", "#475569"], glyph: "⚙" },
];

type Screen = "boot" | "home" | "drawer" | "app";

export interface SimulatorOptions {
  appName: string;
  packageName: string | null;
  onFrame?: (info: { fps: number }) => void;
}

export class DeviceSimulator {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private dpr = 1;
  private w = 0;
  private h = 0;
  /** logical drawing dims — swapped when the device is rotated */
  private dw = 0;
  private dh = 0;

  private screen: Screen = "boot";
  private bootStart = performance.now();
  private rotation = 0;
  private openApp: SimApp | null = null;

  private touchStart: SimPoint | null = null;
  private lastTouch: SimPoint | null = null;
  private pressedAt: { x: number; y: number } | null = null;

  private typed = "";
  private scroll = 0;
  private notifOpen = false;
  private lastFrame = performance.now();
  private frames = 0;
  private fpsWindowStart = performance.now();
  private fps = 60;

  constructor(
    canvas: HTMLCanvasElement,
    private options: SimulatorOptions,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas not supported");
    this.ctx = ctx;
    this.canvas = canvas;
    this.resize();
  }

  private canvas: HTMLCanvasElement;

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start() {
    const loop = () => {
      this.draw(performance.now());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  /** Re-runs the boot animation (used by "reboot" in the toolbar). */
  reboot() {
    this.screen = "boot";
    this.bootStart = performance.now();
    this.openApp = null;
    this.scroll = 0;
  }

  rotate() {
    this.rotation = (this.rotation + 1) % 4;
  }

  getRotation() {
    return this.rotation;
  }

  getFps() {
    return this.fps;
  }

  /* ------------------------------------------------------------------ */
  /* input                                                              */
  /* ------------------------------------------------------------------ */

  handleFrame(frame: ControlFrame) {
    switch (frame.type) {
      case "touch":
        if (frame.action === "down") this.onDown({ x: frame.x, y: frame.y, t: performance.now() });
        else if (frame.action === "move") this.onMove({ x: frame.x, y: frame.y, t: performance.now() });
        else this.onUp({ x: frame.x, y: frame.y, t: performance.now() });
        break;
      case "swipe":
        this.onSwipe(frame.x1, frame.y1, frame.x2, frame.y2);
        break;
      case "key":
        this.onKey(frame.text ?? "");
        break;
      case "command":
        this.onCommand(frame.action);
        break;
    }
  }

  private onDown(p: SimPoint) {
    this.touchStart = p;
    this.lastTouch = p;
    this.pressedAt = { x: p.x, y: p.y };
  }

  private onMove(p: SimPoint) {
    this.lastTouch = p;
  }

  private onUp(p: SimPoint) {
    const start = this.touchStart;
    this.touchStart = null;
    this.pressedAt = null;
    if (!start) return;

    const dx = p.x - start.x;
    const dy = p.y - start.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0.06) {
      this.onSwipe(start.x, start.y, p.x, p.y);
      return;
    }

    this.tap(p.x, p.y);
  }

  private onSwipe(x1: number, y1: number, x2: number, y2: number) {
    const dy = y2 - y1;

    if (this.screen === "drawer" && dy < -0.1) {
      this.screen = "home";
      return;
    }
    if (this.screen === "home" && dy > 0.12) {
      this.screen = "drawer";
      return;
    }
    if (this.screen === "home" && dy < -0.12) {
      this.notifOpen = !this.notifOpen;
      return;
    }
    if (this.screen === "app") {
      this.scroll = Math.max(-120, Math.min(120, this.scroll - dy * 400));
      return;
    }
    if (this.screen === "drawer") {
      this.scroll = Math.max(-60, Math.min(160, this.scroll - dy * 420));
    }
  }

  private tap(x: number, y: number) {
    if (this.screen === "boot") return;

    // system navigation bar (bottom 8%)
    if (y > 0.92) {
      if (x < 0.2) {
        this.goHome();
        return;
      }
      if (x > 0.8) {
        if (this.screen === "app") this.goHome();
        else this.screen = "home";
        return;
      }
      this.screen = this.screen === "app" ? "home" : this.screen;
      if (this.screen === "home") this.openApp = null;
      return;
    }

    if (this.screen === "drawer") {
      const cols = 4;
      const rows = Math.ceil(APPS.length / cols);
      const gridTop = 0.16;
      const gridHeight = 0.62;
      const cellH = gridHeight / rows;
      const cellW = 0.9 / cols;
      const col = Math.floor((x - 0.05) / cellW);
      const row = Math.floor((y - gridTop - this.scrollOffsetNorm()) / cellH);
      const idx = row * cols + col;
      if (col >= 0 && col < cols && idx >= 0 && idx < APPS.length) {
        this.launch(APPS[idx]);
      }
      return;
    }

    if (this.screen === "home") {
      // dock (4 slots) and first app row
      if (y > 0.78 && y < 0.9) {
        const idx = Math.floor((x - 0.06) / 0.22);
        if (idx >= 0 && idx < APPS.length) this.launch(APPS[idx]);
        return;
      }
      if (y > 0.2 && y < 0.72) {
        const cols = 4;
        const col = Math.floor((x - 0.06) / 0.22);
        const row = Math.floor((y - 0.2) / 0.16);
        const idx = row * cols + col;
        if (col >= 0 && col < cols && idx >= 0 && idx < APPS.length) {
          this.launch(APPS[idx]);
        }
      }
    }
  }

  private scrollOffsetNorm() {
    return (this.scroll / 400) * 0.2;
  }

  private launch(app: SimApp) {
    this.openApp = app;
    this.screen = "app";
    this.scroll = 0;
  }

  private goHome() {
    // A swipe up from the gesture pill behaves exactly like this.
    if (this.screen === "app") {
      this.screen = "home";
      this.openApp = null;
    } else {
      this.screen = "home";
    }
  }

  private onKey(text: string) {
    this.typed = (this.typed + text).slice(-120);
  }

  private onCommand(action: Extract<ControlFrame, { type: "command" }>["action"]) {
    switch (action) {
      case "rotate":
        this.rotate();
        break;
      case "home":
        this.goHome();
        break;
      case "recents":
        this.screen = "home";
        this.openApp = null;
        break;
      case "back":
      case "power":
        if (this.screen === "app") this.goHome();
        else if (this.screen === "drawer") this.screen = "home";
        else {
          this.screen = "boot";
          this.bootStart = performance.now();
        }
        break;
      case "volume-up":
      case "volume-down":
        this.toast(action === "volume-up" ? "Volume up" : "Volume down");
        break;
      case "screenshot":
        this.toast("Screenshot captured");
        break;
    }
  }

  private toastMessage: string | null = null;
  private toastUntil = 0;

  private toast(message: string) {
    this.toastMessage = message;
    this.toastUntil = performance.now() + 2200;
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  private draw(now: number) {
    this.frames++;
    if (now - this.fpsWindowStart >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsWindowStart));
      this.frames = 0;
      this.fpsWindowStart = now;
      this.options.onFrame?.({ fps: this.fps });
    }
    this.lastFrame = now;

    const ctx = this.ctx;
    if (this.w === 0 || this.h === 0) return;

    const rotated = this.rotation % 2 === 1;
    this.dw = rotated ? this.h : this.w;
    this.dh = rotated ? this.w : this.h;

    ctx.save();
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, this.w, this.h);

    if (rotated) {
      ctx.translate(this.w, 0);
      ctx.rotate(Math.PI / 2);
    }

    if (this.screen === "boot") {
      this.drawBoot(now);
    } else {
      this.drawHome(now);
      if (this.screen === "drawer") this.drawDrawer(now);
      if (this.screen === "app") this.drawApp(now);
      if (this.notifOpen) this.drawNotificationShade(now);
    }

    this.drawChrome(now);
    ctx.restore();
  }

  private gradient(colors: [string, string], x0: number, y0: number, x1: number, y1: number) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
    return g;
  }

  private drawBoot(now: number) {
    const t = Math.min(1, (now - this.bootStart) / 2600);
    const w = this.dw;
    const h = this.dh;
    const ctx = this.ctx;

    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, w, h);

    // aurora
    const r = Math.max(w, h);
    const glow = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, r * 0.8);
    glow.addColorStop(0, `rgba(99,102,241,${0.25 * t})`);
    glow.addColorStop(0.5, `rgba(6,182,212,${0.12 * t})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // logo mark
    const size = Math.min(w, h) * 0.16;
    const cx = w / 2;
    const cy = h * 0.44;
    const scale = 0.8 + Math.sin(Math.min(1, t * 2) * Math.PI) * 0.2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    const grad = ctx.createLinearGradient(-size, size, size, -size);
    grad.addColorStop(0, "#67e8f9");
    grad.addColorStop(0.5, "#a5b4fc");
    grad.addColorStop(1, "#c4b5fd");
    ctx.strokeStyle = grad;
    ctx.lineWidth = size * 0.13;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-size / 2, size / 2);
    ctx.lineTo(-size / 2, -size / 2);
    ctx.lineTo(size / 2, size / 2);
    ctx.lineTo(size / 2, -size / 2);
    ctx.stroke();
    ctx.restore();

    // wordmark
    ctx.globalAlpha = Math.min(1, Math.max(0, (t - 0.35) * 3));
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `600 ${Math.round(w * 0.055)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("NexusAPK", cx, cy + size * 1.5);

    ctx.fillStyle = "rgba(161,161,170,0.75)";
    ctx.font = `400 ${Math.round(w * 0.032)}px "JetBrains Mono", monospace`;
    ctx.fillText("cloud device", cx, cy + size * 1.5 + w * 0.06);
    ctx.globalAlpha = 1;

    // progress bar
    const barW = w * 0.42;
    const barH = Math.max(2, h * 0.004);
    const bx = (w - barW) / 2;
    const by = h * 0.7;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, bx, by, barW, barH, barH / 2);
    ctx.fill();
    ctx.fillStyle = "rgba(129,140,248,0.95)";
    roundRect(ctx, bx, by, barW * t, barH, barH / 2);
    ctx.fill();

    ctx.fillStyle = "rgba(113,113,122,0.85)";
    ctx.font = `400 ${Math.round(w * 0.028)}px "JetBrains Mono", monospace`;
    ctx.fillText(
      t >= 1 ? "starting launcher" : `${Math.round(t * 100)}% · booting system`,
      cx,
      by + h * 0.045,
    );

    if (t >= 1 && now - this.bootStart > 2900) {
      this.screen = "home";
    }
  }

  private drawHome(_now: number) {
    const w = this.dw;
    const h = this.dh;
    const ctx = this.ctx;

    const bg = this.gradient(["#0b1020", "#140b23"], 0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // ambient blooms
    const bloom1 = ctx.createRadialGradient(w * 0.2, h * 0.15, 0, w * 0.2, h * 0.15, w * 0.9);
    bloom1.addColorStop(0, "rgba(99,102,241,0.28)");
    bloom1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom1;
    ctx.fillRect(0, 0, w, h);

    const bloom2 = ctx.createRadialGradient(w * 0.85, h * 0.75, 0, w * 0.85, h * 0.75, w * 0.8);
    bloom2.addColorStop(0, "rgba(6,182,212,0.18)");
    bloom2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom2;
    ctx.fillRect(0, 0, w, h);

    // clock widget
    const time = formatClock();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.font = `300 ${Math.round(w * 0.17)}px Inter, system-ui, sans-serif`;
    ctx.fillText(time.time, w / 2, h * 0.17);

    ctx.fillStyle = "rgba(212,212,216,0.7)";
    ctx.font = `400 ${Math.round(w * 0.033)}px Inter, system-ui, sans-serif`;
    ctx.fillText(time.date, w / 2, h * 0.205);

    // installed app tiles
    const cols = 4;
    const labels = [
      this.options.appName.slice(0, 12),
      ...APPS.slice(0, 7).map((a) => a.label),
    ];
    const rowTop = [0.25, 0.41, 0.57];
    const tile = Math.min(w * 0.16, h * 0.075);
    const gapX = (w * 0.88 - cols * tile) / (cols - 1);

    labels.forEach((label, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (row > 2) return;
      const x = w * 0.06 + col * (tile + gapX);
      const y = h * rowTop[row];
      const app = i === 0 ? null : APPS[i - 1];
      const colors: [string, string] = app ? app.colors : ["#818cf8", "#22d3ee"];

      // press feedback
      const pressed =
        this.pressedAt &&
        this.pressedAt.x > x / w &&
        this.pressedAt.x < (x + tile) / w &&
        this.pressedAt.y > y / h &&
        this.pressedAt.y < (y + tile) / h;

      ctx.save();
      if (pressed) {
        ctx.translate(x + tile / 2, y + tile / 2);
        ctx.scale(0.93, 0.93);
        ctx.translate(-(x + tile / 2), -(y + tile / 2));
      }

      // glass tile
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      roundRect(ctx, x, y, tile, tile, tile * 0.26);
      ctx.fill();

      ctx.fillStyle = this.gradient(colors, x, y, x + tile, y + tile);
      roundRect(ctx, x + tile * 0.09, y + tile * 0.09, tile * 0.82, tile * 0.82, tile * 0.2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `600 ${Math.round(tile * 0.34)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        i === 0 ? this.options.appName.charAt(0).toUpperCase() : (app?.glyph ?? "•"),
        x + tile / 2,
        y + tile * 0.62,
      );
      ctx.restore();

      ctx.fillStyle = "rgba(228,228,231,0.82)";
      ctx.font = `500 ${Math.round(w * 0.028)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(label, x, y + tile + h * 0.022);
    });

    // dock
    const dockH = h * 0.095;
    const dockY = h * 0.8;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, w * 0.045, dockY, w * 0.91, dockH, dockH / 2);
    ctx.fill();

    APPS.slice(0, 4).forEach((app, i) => {
      const tileW = Math.min(w * 0.13, h * 0.058);
      const x = w * 0.075 + i * (tileW + w * 0.045);
      const y = dockY + (dockH - tileW) / 2;
      ctx.fillStyle = this.gradient(app.colors, x, y, x + tileW, y + tileW);
      roundRect(ctx, x, y, tileW, tileW, tileW * 0.28);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `600 ${Math.round(tileW * 0.4)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(app.glyph, x + tileW / 2, y + tileW / 2 + 1);
      ctx.textBaseline = "alphabetic";
    });
  }

  private drawDrawer(_now: number) {
    const w = this.dw;
    const h = this.dh;
    const ctx = this.ctx;

    ctx.fillStyle = "rgba(6,7,12,0.88)";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 1;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "rgba(30,27,75,0.85)");
    bg.addColorStop(1, "rgba(8,8,12,0.95)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.fillStyle = "rgba(228,228,231,0.9)";
    ctx.font = `500 ${Math.round(w * 0.04)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("All apps", w * 0.06, h * 0.1);

    const cols = 4;
    const rows = Math.ceil(APPS.length / cols);
    const tile = Math.min(w * 0.15, h * 0.072);
    const gapX = (w * 0.88 - cols * tile) / (cols - 1);
    const gridTop = h * 0.16;
    const cellH = (h * 0.62) / rows;
    const offset = this.scrollOffsetNorm() * h;

    APPS.forEach((app, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = w * 0.06 + col * (tile + gapX);
      const y = gridTop + row * cellH + offset;

      ctx.fillStyle = this.gradient(app.colors, x, y, x + tile, y + tile);
      roundRect(ctx, x, y, tile, tile, tile * 0.26);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `600 ${Math.round(tile * 0.38)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(app.glyph, x + tile / 2, y + tile / 2);
      ctx.textBaseline = "alphabetic";

      ctx.fillStyle = "rgba(212,212,216,0.8)";
      ctx.font = `500 ${Math.round(w * 0.027)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(app.label, x, y + tile + h * 0.02);
    });

    // search pill
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, w * 0.06, h * 0.85, w * 0.88, h * 0.05, h * 0.025);
    ctx.fill();
    ctx.fillStyle = "rgba(161,161,170,0.7)";
    ctx.font = `400 ${Math.round(w * 0.03)}px Inter, system-ui, sans-serif`;
    ctx.fillText("Search apps", w * 0.11, h * 0.883);
  }

  private drawApp(_now: number) {
    const w = this.dw;
    const h = this.dh;
    const ctx = this.ctx;
    const app = this.openApp;
    if (!app) return;

    const bg = this.gradient(
      [app.colors[0] + "22", "#08080c"] as unknown as [string, string],
      0,
      0,
      w,
      h,
    );
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const bloom = ctx.createRadialGradient(w / 2, h * 0.15, 0, w / 2, h * 0.15, w);
    bloom.addColorStop(0, hexAlpha(app.colors[0], 0.35));
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);

    // app bar
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `600 ${Math.round(w * 0.045)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(app.label, w * 0.07, h * 0.115);

    // back chevron
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = w * 0.008;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w * 0.07, h * 0.155);
    ctx.lineTo(w * 0.035, h * 0.135);
    ctx.lineTo(w * 0.07, h * 0.115 - h * 0.02);
    ctx.stroke();

    // content cards
    const top = h * 0.19 + this.scroll / 700;
    for (let i = 0; i < 5; i++) {
      const y = top + i * h * 0.135;
      if (y > h * 0.9) break;
      ctx.fillStyle = "rgba(255,255,255,0.055)";
      roundRect(ctx, w * 0.05, y, w * 0.9, h * 0.11, w * 0.04);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      roundRect(ctx, w * 0.05, y, w * 0.9, h * 0.11, w * 0.04);
      ctx.stroke();

      ctx.fillStyle = hexAlpha(app.colors[0], 0.9);
      roundRect(ctx, w * 0.08, y + h * 0.022, w * 0.13, h * 0.062, w * 0.03);
      ctx.fill();

      ctx.fillStyle = "rgba(244,244,245,0.9)";
      ctx.font = `600 ${Math.round(w * 0.03)}px Inter, system-ui, sans-serif`;
      ctx.fillText(`${app.label} item ${i + 1}`, w * 0.24, y + h * 0.045);

      ctx.fillStyle = "rgba(161,161,170,0.65)";
      ctx.font = `400 ${Math.round(w * 0.025)}px Inter, system-ui, sans-serif`;
      ctx.fillText("Rendered by the browser simulator", w * 0.24, y + h * 0.075);
    }

    // typed text preview (keyboard forwarding demo)
    if (this.typed) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, w * 0.05, h * 0.79, w * 0.9, h * 0.075, w * 0.03);
      ctx.fill();
      ctx.fillStyle = "rgba(165,180,252,0.95)";
      ctx.font = `400 ${Math.round(w * 0.028)}px "JetBrains Mono", monospace`;
      ctx.fillText(this.typed.slice(-26), w * 0.08, h * 0.835);
    }
  }

  private drawNotificationShade(_now: number) {
    const w = this.dw;
    const h = this.dh;
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(5,5,10,0.94)";
    roundRect(ctx, w * 0.04, h * 0.04, w * 0.92, h * 0.5, w * 0.06);
    ctx.fill();

    const time = formatClock();
    ctx.fillStyle = "rgba(244,244,245,0.95)";
    ctx.font = `600 ${Math.round(w * 0.05)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(time.time, w / 2, h * 0.13);
    ctx.fillStyle = "rgba(161,161,170,0.8)";
    ctx.font = `400 ${Math.round(w * 0.028)}px Inter, system-ui, sans-serif`;
    ctx.fillText(time.date, w / 2, h * 0.16);

    const notices = [
      ["NexusAPK", "Session streaming at 60 fps"],
      ["System", "Battery optimisation is on"],
      ["Studio", `${this.options.packageName ?? "app"} installed`],
    ];
    notices.forEach(([title, body], i) => {
      const y = h * 0.21 + i * h * 0.095;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      roundRect(ctx, w * 0.07, y, w * 0.86, h * 0.082, w * 0.035);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(228,228,231,0.95)";
      ctx.font = `600 ${Math.round(w * 0.028)}px Inter, system-ui, sans-serif`;
      ctx.fillText(title, w * 0.1, y + h * 0.03);
      ctx.fillStyle = "rgba(161,161,170,0.8)";
      ctx.font = `400 ${Math.round(w * 0.025)}px Inter, system-ui, sans-serif`;
      ctx.fillText(body, w * 0.1, y + h * 0.06);
    });
  }

  /** status bar + gesture pill + transient toast */
  private drawChrome(now: number) {
    const w = this.dw;
    const h = this.dh;
    const ctx = this.ctx;

    if (this.screen !== "boot") {
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `500 ${Math.round(w * 0.028)}px Inter, system-ui, sans-serif`;
      ctx.fillText(formatClock().time, w * 0.06, h * 0.045);

      // signal + battery
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (let i = 0; i < 4; i++) {
        const bh = h * 0.008 * (i + 1);
        ctx.fillRect(w * 0.78 + i * w * 0.011, h * 0.042 - bh, w * 0.007, bh);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = Math.max(1, w * 0.004);
      roundRect(ctx, w * 0.85, h * 0.031, w * 0.09, h * 0.019, w * 0.006);
      ctx.stroke();
      ctx.fillStyle = "rgba(16,185,129,0.9)";
      roundRect(ctx, w * 0.855, h * 0.034, w * 0.06, h * 0.013, w * 0.004);
      ctx.fill();

      // gesture pill
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      roundRect(ctx, w * 0.36, h * 0.965, w * 0.28, h * 0.006, h * 0.003);
      ctx.fill();
    }

    if (this.toastMessage && now < this.toastUntil) {
      const alpha = Math.min(1, (this.toastUntil - now) / 400);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(15,15,22,0.95)";
      roundRect(ctx, w * 0.2, h * 0.87, w * 0.6, h * 0.05, h * 0.025);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      roundRect(ctx, w * 0.2, h * 0.87, w * 0.6, h * 0.05, h * 0.025);
      ctx.stroke();
      ctx.fillStyle = "rgba(244,244,245,0.95)";
      ctx.font = `500 ${Math.round(w * 0.028)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(this.toastMessage, w / 2, h * 0.902);
      ctx.globalAlpha = 1;
    }
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function formatClock() {
  const d = new Date();
  const hh = d.getHours();
  const mm = d.getMinutes().toString().padStart(2, "0");
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return {
    time: `${hour12}:${mm}`,
    date: d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    }),
  };
}

function hexAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
