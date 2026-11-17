#!/usr/bin/env node
/**
 * verify-policy.mjs — asserts the session-limit policy.
 *
 * Product rule under test: a signed-in account is unrestricted. Only an
 * operator-configured TTL (or the demo tour) produces a countdown, and a
 * lease-free session must never be created just because a default leaked in.
 *
 * `sessionTtlSeconds()` reads `process.env` at call time, so the module is
 * imported once and the variable is swapped between assertions.
 *
 * Run with: npm run verify:policy
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const {
  sessionTtlSeconds,
  sessionsExpire,
  expiryForTtl,
  DEMO_SESSION_TTL_SECONDS,
  SESSION_IDLE_GRACE_SECONDS,
} = await import(
  pathToFileURL(resolve(process.cwd(), "lib/session-policy.ts")).href
);

let failures = 0;

function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`,
  );
}

function withTtl(raw) {
  if (raw === undefined) delete process.env.NEXUS_SESSION_TTL_SECONDS;
  else process.env.NEXUS_SESSION_TTL_SECONDS = raw;
}

/* Unset / invalid configuration means "no lease" — never a silent 15 minutes. */
for (const raw of [undefined, "", "   ", "0", "-5", "nope", "Infinity"]) {
  withTtl(raw);
  const label = JSON.stringify(raw);
  check(`sessionTtlSeconds(${label})`, sessionTtlSeconds(), null);
  check(`sessionsExpire(${label})`, sessionsExpire(), false);
  check(`expiryForTtl(null) for ${label}`, expiryForTtl(null), null);
}

/* An explicit positive TTL is honoured, with whitespace tolerated. */
for (const [raw, expected] of [
  ["900", 900],
  ["  1200  ", 1200],
  ["60.9", 60],
]) {
  withTtl(raw);
  const label = JSON.stringify(raw);
  check(`sessionTtlSeconds(${label})`, sessionTtlSeconds(), expected);
  check(`sessionsExpire(${label})`, sessionsExpire(), true);

  const expiry = expiryForTtl(sessionTtlSeconds());
  const delta = expiry ? Math.round((new Date(expiry).getTime() - Date.now()) / 1000) : null;
  check(`expiryForTtl(${label}) is ~${expected}s out`, delta !== null && Math.abs(delta - expected) <= 2, true);
}

/* The demo tour is the only built-in bound, and it must not leak into the app. */
withTtl(undefined);
check("DEMO_SESSION_TTL_SECONDS", DEMO_SESSION_TTL_SECONDS, 15 * 60);
check("SESSION_IDLE_GRACE_SECONDS", SESSION_IDLE_GRACE_SECONDS, 30 * 60);
check("default signed-in TTL is unlimited", sessionTtlSeconds(), null);

console.log(
  failures === 0
    ? "\nAll session-policy assertions passed."
    : `\n${failures} assertion(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
