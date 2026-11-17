/** Shared domain types for the NexusAPK control plane. */

export type ApkStatus = "processing" | "ready" | "failed";

export interface ApkRecord {
  id: string;
  owner_id: string;
  display_name: string;
  package_name: string | null;
  version_name: string | null;
  version_code: number | null;
  min_sdk: number | null;
  target_sdk: number | null;
  size_bytes: number;
  sha256: string | null;
  storage_path: string;
  icon_path: string | null;
  status: ApkStatus;
  error_message: string | null;
  launch_count: number;
  last_launched_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SessionState =
  | "pending"
  | "provisioning"
  | "installing"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

export interface SessionRecord {
  id: string;
  apk_id: string;
  owner_id: string;
  backend_session_id: string | null;
  state: SessionState;
  device_profile: DeviceProfile;
  stream_url: string | null;
  ws_url: string | null;
  adb_port: number | null;
  container_id: string | null;
  /** rendered by the in-browser simulator rather than a redroid container */
  simulated: boolean;
  error_message: string | null;
  started_at: string;
  expires_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
}

export interface SessionEvent {
  id: number;
  session_id: string;
  owner_id: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  created_at: string;
}

export type DeviceProfile = "phone" | "phone-xl" | "tablet";

export interface DeviceSpec {
  id: DeviceProfile;
  label: string;
  /** logical adb display size */
  width: number;
  height: number;
  dpi: number;
  /** css aspect ratio helper */
  ratio: number;
  notch: "punch" | "notch" | "none";
}

export const DEVICE_PROFILES: Record<DeviceProfile, DeviceSpec> = {
  phone: {
    id: "phone",
    label: "Nexus Phone",
    width: 1080,
    height: 2400,
    dpi: 420,
    ratio: 1080 / 2400,
    notch: "punch",
  },
  "phone-xl": {
    id: "phone-xl",
    label: "Nexus Phone XL",
    width: 1440,
    height: 3120,
    dpi: 560,
    ratio: 1440 / 3120,
    notch: "punch",
  },
  tablet: {
    id: "tablet",
    label: "Nexus Tablet",
    width: 1600,
    height: 2560,
    dpi: 320,
    ratio: 1600 / 2560,
    notch: "none",
  },
};

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan: string;
  created_at: string;
}

/** Normalized result shape returned by every FastAPI orchestrator call. */
export interface BackendSession {
  session_id: string;
  state: SessionState;
  container_id?: string | null;
  adb_port?: number | null;
  stream_url?: string | null;
  ws_url?: string | null;
  device_profile?: DeviceProfile;
  expires_at?: string | null;
  message?: string | null;
}

export interface ApiError {
  error: string;
  detail?: string;
  code?: string;
}
