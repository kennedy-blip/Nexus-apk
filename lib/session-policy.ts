/**
 * Session policy — the single place that decides how long a signed-in user may
 * keep a cloud device.
 *
 * Product rule: an authenticated account has unrestricted access to the
 * platform. There is no countdown, no lease expiry and therefore nothing to
 * renew, because a paying/signed-in user should never be interrupted mid-work
 * by a timer they did not ask for.
 *
 * The demo (`/demo`) is deliberately different: it runs on the local browser
 * simulator with no account, no database and no orchestrator, so it keeps a
 * bounded lease. That keeps the clearly-labelled tour finite without ever
 * touching a real user's session.
 *
 * Ops safety valve: a real redroid container still costs RAM and a port, so an
 * operator can opt into expiry with `NEXUS_SESSION_TTL_SECONDS` for capacity
 * planning. When unset (the default) sessions never lapse on their own; a user
 * ends them with "End session", and an unloaded tab is cleaned up by the idle
 * guard in the reaper rather than by a wall-clock lease.
 */

/** Demo-only lease. Never applied to an authenticated session. */
export const DEMO_SESSION_TTL_SECONDS = 15 * 60;

/**
 * How often the playground renews its lease. Only meaningful when an operator
 * has opted into a finite TTL.
 */
export const SESSION_HEARTBEAT_MS = 60_000;

/**
 * A session with no heartbeat for this long is considered abandoned. Only used
 * to clean up sessions that opted into expiry — indefinite sessions are left
 * alone because there is no timer to extend.
 */
export const SESSION_IDLE_GRACE_SECONDS = 30 * 60;

/**
 * Resolve the lease for an authenticated session.
 *
 * Returns `null` when sessions should never expire (the default), or a positive
 * number of seconds when an operator has explicitly configured a finite TTL.
 */
export function sessionTtlSeconds(): number | null {
  const raw = process.env.NEXUS_SESSION_TTL_SECONDS;
  if (raw === undefined || raw === null || raw.trim() === "") return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.floor(parsed);
}

/** True when signed-in sessions are time-limited by operator configuration. */
export function sessionsExpire(): boolean {
  return sessionTtlSeconds() !== null;
}

/**
 * `expires_at` for a new session: a timestamp when a finite TTL is configured,
 * otherwise `null` so the UI has nothing to count down.
 */
export function expiryForTtl(ttlSeconds: number | null): string | null {
  if (ttlSeconds === null) return null;
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}
