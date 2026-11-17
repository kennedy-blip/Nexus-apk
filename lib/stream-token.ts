import crypto from "node:crypto";

/**
 * Mirrors `backend/app/security.py` so the control plane can mint the same
 * short-lived stream tokens the orchestrator verifies. Both sides sign
 * `<base64url(json)>` with HMAC-SHA256 using `NEXUS_BACKEND_TOKEN`.
 *
 * Tokens are bound to one session id and an expiry, and are consumed by
 * transports that cannot send an Authorization header: MJPEG `<img>` tags and
 * browser WebSocket handshakes.
 */

export interface StreamTokenPayload {
  sid: string;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 300;

function b64url(buffer: Buffer | string): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(secret: string, body: string): string {
  return b64url(crypto.createHmac("sha256", secret).update(body).digest());
}

export function issueStreamToken(
  sessionId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string | null {
  const secret = process.env.NEXUS_BACKEND_TOKEN;
  if (!secret) return null;

  const payload: StreamTokenPayload = {
    sid: sessionId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(secret, body)}`;
}

/**
 * Builds the browser-facing stream URLs.
 *
 * - If `NEXUS_STREAM_PUBLIC_URL` is set (orchestrator directly reachable), the
 *   browser talks to it with a signed token.
 * - Otherwise the URLs point at our own same-origin proxy
 *   (`/api/stream/[id]`), which injects the bearer token server-side. This is
 *   the default because the orchestrator normally lives on a private network.
 */
export function buildStreamUrls(
  sessionId: string,
  backendStreamUrl: string | null,
  backendWsUrl: string | null,
): { streamUrl: string | null; wsUrl: string | null } {
  if (!backendStreamUrl && !backendWsUrl) {
    return { streamUrl: null, wsUrl: null };
  }

  const token = issueStreamToken(sessionId);
  const publicBase = (process.env.NEXUS_STREAM_PUBLIC_URL ?? "").replace(/\/$/, "");

  if (publicBase) {
    const query = token ? `?token=${token}` : "";
    const wsOrigin = publicBase.replace(/^http/, "ws");
    return {
      streamUrl: `${publicBase}/api/stream/${sessionId}/mjpeg${query}`,
      wsUrl: backendWsUrl
        ? `${wsOrigin}/api/stream/${sessionId}/control${query}`
        : null,
    };
  }

  // Same-origin proxy paths (relative so they work behind any host/proto).
  return {
    streamUrl: `/api/stream/${sessionId}/frames`,
    wsUrl: `/api/stream/${sessionId}/control`,
  };
}
