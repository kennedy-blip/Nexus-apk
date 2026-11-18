/**
 * Request-safety rules for the inspector.
 *
 * The inspector fetches URLs that a user typed, which makes it an SSRF sink by
 * construction. Every hop — the initial URL *and* each redirect target — must be
 * re-validated, otherwise a public host can bounce us into `169.254.169.254` and
 * read cloud metadata.
 *
 * The rule is: resolve the hostname first, inspect the *addresses* rather than
 * the name, then connect. Names are trivially spoofable; addresses are not.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class BlockedTargetError extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = "BlockedTargetError";
  }
}

/** Only these schemes can be inspected. `file:`, `gopher:` etc. are refused. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * IPv4 ranges that must never be reachable. Covers loopback, link-local
 * (including the cloud metadata endpoint), private space, CGNAT, and the
 * documentation/test ranges.
 */
const V4_BLOCKED: Array<{ cidr: [string, number]; reason: string }> = [
  { cidr: ["0.0.0.0", 8], reason: "unspecified/current network" },
  { cidr: ["10.0.0.0", 8], reason: "private network" },
  { cidr: ["100.64.0.0", 10], reason: "carrier-grade NAT" },
  { cidr: ["127.0.0.0", 8], reason: "loopback" },
  { cidr: ["169.254.0.0", 16], reason: "link-local / cloud metadata" },
  { cidr: ["172.16.0.0", 12], reason: "private network" },
  { cidr: ["192.0.0.0", 24], reason: "IETF protocol assignments" },
  { cidr: ["192.0.2.0", 24], reason: "documentation range" },
  { cidr: ["192.168.0.0", 16], reason: "private network" },
  { cidr: ["198.18.0.0", 15], reason: "benchmarking range" },
  { cidr: ["198.51.100.0", 24], reason: "documentation range" },
  { cidr: ["203.0.113.0", 24], reason: "documentation range" },
  { cidr: ["224.0.0.0", 4], reason: "multicast" },
  { cidr: ["240.0.0.0", 4], reason: "reserved" },
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  // >>> 0 keeps the result unsigned; JS bitwise ops yield signed 32-bit.
  return value >>> 0;
}

function inV4Range(ip: string, base: string, bits: number): boolean {
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a === null || b === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/**
 * True when an address is safe to connect to.
 *
 * IPv6 is handled structurally: loopback `::1`, unspecified `::`, unique-local
 * `fc00::/7`, link-local `fe80::/10`, and IPv4-mapped forms such as
 * `::ffff:127.0.0.1` which would otherwise smuggle a blocked v4 address past a
 * naive check.
 */
export function isAddressAllowed(address: string): { allowed: boolean; reason?: string } {
  const version = isIP(address);

  if (version === 4) {
    for (const { cidr, reason } of V4_BLOCKED) {
      if (inV4Range(address, cidr[0], cidr[1])) return { allowed: false, reason };
    }
    return { allowed: true };
  }

  if (version === 6) {
    const normalised = address.toLowerCase().split("%")[0];

    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms.
    const mapped = normalised.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isAddressAllowed(mapped[1]);

    if (normalised === "::1") return { allowed: false, reason: "loopback" };
    if (normalised === "::") return { allowed: false, reason: "unspecified address" };

    const leading = normalised.split(":")[0] ?? "";
    const firstGroup = Number.parseInt(leading.padStart(4, "0").slice(0, 4), 16);
    if (Number.isFinite(firstGroup)) {
      if ((firstGroup & 0xfe00) === 0xfc00) {
        return { allowed: false, reason: "unique-local address" };
      }
      if ((firstGroup & 0xffc0) === 0xfe80) {
        return { allowed: false, reason: "link-local address" };
      }
      if ((firstGroup & 0xff00) === 0xff00) {
        return { allowed: false, reason: "multicast" };
      }
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "not an IP address" };
}

/**
 * Normalise user input into a URL.
 *
 * People paste `example.com`, `instagram.com/p/xyz`, or a full URL. A bare host
 * gets `https://` because that is the overwhelmingly common intent and it fails
 * safe: we never silently reach for plaintext http.
 */
export function normaliseTarget(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new BlockedTargetError("Enter a URL to inspect", "empty");

  // Strip wrapping quotes/angle brackets people pick up when copying.
  const cleaned = raw.replace(/^[<("'\s]+|[>)"'\s]+$/g, "");
  if (!cleaned) throw new BlockedTargetError("Enter a URL to inspect", "empty");

  // Catch dangerous schemes that carry no `//` — `javascript:`, `data:`,
  // `file:`. Without this they fall through to the "assume https" branch and
  // surface as a confusing parse error instead of an explicit refusal.
  // `host:port` is safe here because the schemes below are an explicit list.
  const dangerousScheme = /^(javascript|data|file|vbscript|blob|about|chrome|gopher|ftp|ftps|ws|wss|mailto|tel):/i.exec(
    cleaned,
  );
  if (dangerousScheme) {
    throw new BlockedTargetError(
      `Only http:// and https:// can be inspected, not ${dangerousScheme[1].toLowerCase()}:`,
      "protocol",
    );
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new BlockedTargetError(`"${cleaned}" is not a valid URL`, "malformed");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new BlockedTargetError(
      `Only http:// and https:// can be inspected, not ${url.protocol}`,
      "protocol",
    );
  }

  // A hostname is mandatory; `https:///path` parses but is useless.
  if (!url.hostname) {
    throw new BlockedTargetError("That URL has no hostname", "no-host");
  }

  return url;
}

/**
 * Resolve a hostname and confirm every address it points at is public.
 *
 * Returns the addresses so the caller can report them without a second lookup.
 * A name that resolves to *any* blocked address is refused outright — a DNS
 * round-robin that includes a private address is a classic rebinding attack.
 */
export async function assertPublicHost(
  hostname: string,
): Promise<{ address: string; family: number; addresses: string[] }> {
  // A literal IP in the URL is checked directly, no resolution needed.
  if (isIP(hostname)) {
    const verdict = isAddressAllowed(hostname);
    if (!verdict.allowed) {
      throw new BlockedTargetError(
        `Refusing to fetch ${hostname}: ${verdict.reason}`,
        verdict.reason ?? "blocked",
      );
    }
    return { address: hostname, family: isIP(hostname), addresses: [hostname] };
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new BlockedTargetError(
      `DNS lookup failed for ${hostname} — the host does not resolve`,
      "dns",
    );
  }

  if (resolved.length === 0) {
    throw new BlockedTargetError(
      `DNS lookup returned no addresses for ${hostname}`,
      "dns",
    );
  }

  for (const entry of resolved) {
    const verdict = isAddressAllowed(entry.address);
    if (!verdict.allowed) {
      throw new BlockedTargetError(
        `Refusing to fetch ${hostname}: it resolves to ${entry.address} (${verdict.reason})`,
        verdict.reason ?? "blocked",
      );
    }
  }

  return {
    address: resolved[0].address,
    family: resolved[0].family,
    addresses: resolved.map((r) => r.address),
  };
}
