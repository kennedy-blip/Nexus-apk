/**
 * Fixture data for the self-contained demo workspace (/demo).
 *
 * The demo route never touches Supabase or the orchestrator, so the studio can
 * be explored end-to-end in environments where those backends are unreachable
 * (air-gapped previews, design reviews, offline development).
 */

import type { ApkRecord, DeviceProfile, SessionEvent } from "@/lib/types";

const now = Date.now();

const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

export interface DemoApk extends Omit<ApkRecord, "owner_id" | "created_at" | "updated_at" | "last_launched_at"> {
  created_at: string;
  updated_at: string;
  last_launched_at: string | null;
  /** tagline shown on the demo card */
  blurb: string;
  accent: [string, string];
}

export const DEMO_APKS: DemoApk[] = [
  {
    id: "demo-boltrides",
    display_name: "Bolt Rides",
    package_name: "io.boltrides.app",
    version_name: "4.2.1",
    version_code: 40201,
    min_sdk: 26,
    target_sdk: 34,
    size_bytes: 48_235_520,
    sha256: "9f2c1a7e5b3d40c8a1f6e2d7c9b0a3f5e8d1c4b7a0f3e6d9c2b5a8f1e4d7c0b3",
    storage_path: "demo/demo-boltrides/BoltRides.apk",
    icon_path: null,
    status: "ready",
    error_message: null,
    launch_count: 42,
    last_launched_at: iso(96),
    created_at: iso(60 * 24 * 3),
    updated_at: iso(96),
    blurb: "Ride-hailing flows with a live map surface.",
    accent: ["#22d3ee", "#6366f1"],
  },
  {
    id: "demo-ledger",
    display_name: "Ledger Pro",
    package_name: "com.ledger.pro",
    version_name: "2.8.0",
    version_code: 20800,
    min_sdk: 24,
    target_sdk: 33,
    size_bytes: 21_884_928,
    sha256: "b7e3d0a4c1f8e2b5d9a6c3f0e7b4d1a8c5f2e9b6d3a0c7f4e1b8d5a2c9f6e3b0",
    storage_path: "demo/demo-ledger/LedgerPro.apk",
    icon_path: null,
    status: "ready",
    error_message: null,
    launch_count: 17,
    last_launched_at: iso(60 * 26),
    created_at: iso(60 * 24 * 9),
    updated_at: iso(60 * 26),
    blurb: "Dense data tables and a charts dashboard.",
    accent: ["#8b5cf6", "#6366f1"],
  },
  {
    id: "demo-notes",
    display_name: "Pixel Notes",
    package_name: "app.pixel.notes",
    version_name: "1.14.3",
    version_code: 11403,
    min_sdk: 28,
    target_sdk: 34,
    size_bytes: 9_437_184,
    sha256: "d1a8c5f2e9b6d3a0c7f4e1b8d5a2c9f6e3b0b7e3d0a4c1f8e2b5d9a6c3f0e7b4",
    storage_path: "demo/demo-notes/PixelNotes.apk",
    icon_path: null,
    status: "ready",
    error_message: null,
    launch_count: 5,
    last_launched_at: iso(60 * 24 * 2),
    created_at: iso(60 * 24 * 12),
    updated_at: iso(60 * 24 * 2),
    blurb: "Markdown editor with gesture-first navigation.",
    accent: ["#34d399", "#0ea5e9"],
  },
];

export function findDemoApk(id: string): DemoApk | undefined {
  return DEMO_APKS.find((apk) => apk.id === id);
}

/** Synthetic, realistic boot log for the demo console. */
export function demoEvents(deviceProfile: DeviceProfile): SessionEvent[] {
  const base = now;
  const lines: Array<[SessionEvent["level"], string, number]> = [
    ["info", "Session requested · orchestrator handshake accepted", 0],
    ["info", `Allocating device profile · ${deviceProfile}`, 0.4],
    ["info", "Pulling redroid/redroid:13.0.0_64only-latest (cache hit)", 1.1],
    ["info", "Container nexus-redroid-a19f3c started · --privileged --mem 6g", 2.3],
    ["debug", "androidboot.redroid_gpu_mode=guest fps=60 dpi=420", 2.9],
    ["info", "adb connect 127.0.0.1:5612 → device online", 5.4],
    ["info", "sys.boot_completed=1 after 11.2s", 11.2],
    ["info", "adb install -r app.apk → Success", 16.8],
    ["info", "launcher resolved; scrcpy bridge attached (H.264, 4 Mbps)", 18.1],
    ["warn", "Skipping audio passthrough — no Opus encoder negotiated", 18.6],
    ["info", "Session streaming · 60 fps · 42 ms round-trip", 19.4],
  ];

  return lines.map(([level, message, offsetSeconds], index) => ({
    id: index + 1,
    session_id: "demo-session",
    owner_id: "demo",
    level,
    message,
    created_at: new Date(base - (20 - offsetSeconds) * 1000).toISOString(),
  }));
}

/** Simulated ingest used by the demo uploader (no network involved). */
export function demoIngest(file: File): DemoApk {
  const baseName = file.name.replace(/\.apk$/i, "");
  const words = baseName.replace(/[._-]+/g, " ").trim();
  const display = words
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const palette: Array<[string, string]> = [
    ["#f472b6", "#8b5cf6"],
    ["#fbbf24", "#f97316"],
    ["#38bdf8", "#818cf8"],
    ["#34d399", "#22d3ee"],
  ];
  const accent = palette[Math.floor(Math.random() * palette.length)];

  return {
    id: `demo-${slug || Math.random().toString(36).slice(2, 8)}`,
    display_name: display || "Untitled App",
    package_name: `com.example.${slug || "app"}`,
    version_name: "1.0.0",
    version_code: 10000,
    min_sdk: 26,
    target_sdk: 34,
    size_bytes: file.size,
    sha256: null,
    storage_path: `demo/${slug}/${file.name}`,
    icon_path: null,
    status: "ready",
    error_message: null,
    launch_count: 0,
    last_launched_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    blurb: "Ingested in demo mode — metadata is simulated locally.",
    accent,
  };
}
