/**
 * Server-only client for the FastAPI container orchestrator.
 *
 * The orchestrator is never reachable from the browser: all calls are made
 * from route handlers with a shared HMAC bearer token, and the browser talks
 * to the streaming endpoints through a separate short-lived, signed URL.
 */

import type { BackendSession, DeviceProfile } from "@/lib/types";

export interface OrchestratorConfig {
  baseUrl: string | null;
  token: string | null;
  configured: boolean;
}

export function orchestratorConfig(): OrchestratorConfig {
  const baseUrl = (process.env.NEXUS_BACKEND_URL ?? "").replace(/\/$/, "");
  const token = process.env.NEXUS_BACKEND_TOKEN ?? "";
  return {
    baseUrl: baseUrl || null,
    token: token || null,
    configured: Boolean(baseUrl && token),
  };
}

export class OrchestratorError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = "orchestrator_error",
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

async function call<T>(
  path: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<T> {
  const { baseUrl, token } = orchestratorConfig();
  if (!baseUrl || !token) {
    throw new OrchestratorError(
      "Orchestrator is not configured",
      503,
      "not_configured",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    const payload = text ? safeJson(text) : null;

    if (!res.ok) {
      const detail =
        (payload as { detail?: string } | null)?.detail ??
        text.slice(0, 300) ??
        res.statusText;
      throw new OrchestratorError(
        typeof detail === "string" ? detail : "Orchestrator request failed",
        res.status,
        (payload as { code?: string } | null)?.code ?? "orchestrator_error",
      );
    }

    return payload as T;
  } catch (err) {
    if (err instanceof OrchestratorError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OrchestratorError("Orchestrator timed out", 504, "timeout");
    }
    throw new OrchestratorError(
      err instanceof Error ? err.message : "Orchestrator unreachable",
      502,
      "unreachable",
    );
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text.slice(0, 300) };
  }
}

export interface StartSessionPayload {
  session_id: string;
  apk_url: string;
  apk_filename: string;
  package_name?: string | null;
  device_profile: DeviceProfile;
  ttl_seconds: number;
}

export async function startRemoteSession(
  payload: StartSessionPayload,
): Promise<BackendSession> {
  return call<BackendSession>("/api/session/start", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 45_000);
}

export async function stopRemoteSession(
  backendSessionId: string,
): Promise<BackendSession> {
  return call<BackendSession>("/api/session/stop", {
    method: "POST",
    body: JSON.stringify({ session_id: backendSessionId }),
  }, 25_000);
}

export async function getRemoteSession(
  backendSessionId: string,
): Promise<BackendSession> {
  return call<BackendSession>(`/api/session/${backendSessionId}`, { method: "GET" });
}

export async function heartbeatRemoteSession(
  backendSessionId: string,
): Promise<BackendSession> {
  return call<BackendSession>(
    `/api/session/${backendSessionId}/heartbeat`,
    { method: "POST", body: "{}" },
    10_000,
  );
}

export async function orchestratorHealth(): Promise<{
  ok: boolean;
  detail?: string;
  containers?: number;
}> {
  try {
    const res = await call<{ status: string; containers?: number }>(
      "/healthz",
      { method: "GET" },
      4000,
    );
    return { ok: res.status === "ok", containers: res.containers };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "unknown" };
  }
}
