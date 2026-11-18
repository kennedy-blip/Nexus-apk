/**
 * Infrastructure facts: DNS, TLS, robots.txt, technology fingerprint.
 *
 * Every probe here is a normal, public, unauthenticated observation — the same
 * records any browser or `dig`/`openssl` invocation would produce.
 */

import { promises as dns } from "node:dns";
import tls from "node:tls";
import { assertPublicHost } from "./url";

export interface DnsReport {
  hostname: string;
  a: string[];
  aaaa: string[];
  cname: string[];
  mx: Array<{ exchange: string; priority: number }>;
  ns: string[];
  txt: string[];
  caa: Array<{ tag: string; value: string }>;
  /** Live addresses actually used, for the report header. */
  addresses: string[];
  errors: Record<string, string>;
}

/** A single resilient lookup per record type — one NXDOMAIN must not sink the rest. */
export async function resolveDns(hostname: string, knownAddresses: string[] = []): Promise<DnsReport> {
  const report: DnsReport = {
    hostname,
    a: [],
    aaaa: [],
    cname: [],
    mx: [],
    ns: [],
    txt: [],
    caa: [],
    addresses: knownAddresses,
    errors: {},
  };

  const attempt = async <T>(label: string, run: () => Promise<T>, assign: (value: T) => void) => {
    try {
      assign(await run());
    } catch (error) {
      report.errors[label] = error instanceof Error ? error.message : String(error);
    }
  };

  await Promise.all([
    attempt("A", () => dns.resolve4(hostname), (v) => (report.a = v)),
    attempt("AAAA", () => dns.resolve6(hostname), (v) => (report.aaaa = v)),
    attempt("CNAME", () => dns.resolveCname(hostname), (v) => (report.cname = v)),
    attempt("MX", () => dns.resolveMx(hostname), (v) => (report.mx = v)),
    attempt("NS", () => dns.resolveNs(hostname), (v) => (report.ns = v)),
    attempt("TXT", () => dns.resolveTxt(hostname), (v) => (report.txt = v.map((parts) => parts.join("")))),
    attempt(
      "CAA",
      () =>
        dns.resolveCaa(hostname) as Promise<Array<{ critical?: number; issue?: string; issuewild?: string; iodef?: string }>>,
      (records) => {
        report.caa = records.flatMap((record) =>
          Object.entries(record)
            .filter(([key]) => ["issue", "issuewild", "iodef"].includes(key))
            .map(([key, value]) => ({ tag: key, value: String(value) })),
        );
      },
    ),
  ]);

  return report;
}

/** Node types these as `string | string[]`; certificates may hold many values. */
function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export interface TlsReport {
  available: boolean;
  error: string | null;
  subject: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  serialNumber: string | null;
  protocol: string | null;
  cipher: string | null;
  /** Subject alternative names — which hosts the certificate actually covers. */
  altNames: string[];
  /** True when the certificate is past its `validTo`. */
  expired: boolean;
}

/**
 * Read the peer certificate.
 *
 * `rejectUnauthorized: false` on purpose: an inspection tool must be able to
 * *report* an expired or self-signed certificate rather than throw on it. We
 * never send credentials over the connection, so accepting it is safe here.
 */
export async function inspectTls(hostname: string, port = 443, address?: string): Promise<TlsReport> {
  const empty: TlsReport = {
    available: false,
    error: null,
    subject: null,
    issuer: null,
    validFrom: null,
    validTo: null,
    daysRemaining: null,
    serialNumber: null,
    protocol: null,
    cipher: null,
    altNames: [],
    expired: false,
  };

  const pinned = address ?? (await assertPublicHost(hostname)).address;

  return new Promise<TlsReport>((resolve) => {
    let settled = false;
    const finish = (value: TlsReport) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const socket = tls.connect(
      {
        host: pinned,
        port,
        servername: hostname,
        rejectUnauthorized: false,
        // Pin to the vetted address, like the HTTP fetcher does. Mirrors the
        // `all` handling there, since autoSelectFamily applies to tls too.
        lookup: (_hostname, options, callback) => {
          const family = hostname.includes(":") ? 6 : 4;
          type LookupCb = (
            err: NodeJS.ErrnoException | null,
            address: string | Array<{ address: string; family: number }>,
            family?: number,
          ) => void;
          const done = callback as unknown as LookupCb;
          if (options && (options as { all?: boolean }).all) {
            done(null, [{ address: pinned, family }]);
            return;
          }
          done(null, pinned, family);
        },
      },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          finish({ ...empty, error: "no peer certificate presented" });
          socket.end();
          return;
        }

        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        const daysRemaining =
          validTo && !Number.isNaN(validTo.getTime())
            ? Math.round((validTo.getTime() - Date.now()) / 86_400_000)
            : null;

        finish({
          available: true,
          error: null,
          subject: firstValue(cert.subject?.CN),
          issuer: firstValue(cert.issuer?.O) ?? firstValue(cert.issuer?.CN),
          validFrom: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
          validTo: validTo && !Number.isNaN(validTo.getTime()) ? validTo.toISOString() : null,
          daysRemaining,
          serialNumber: cert.serialNumber ?? null,
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()?.name ?? null,
          altNames: (cert.subjectaltname ?? "")
            .split(",")
            .map((part) => part.trim().replace(/^DNS:/, ""))
            .filter(Boolean)
            .slice(0, 50),
          expired: daysRemaining !== null && daysRemaining < 0,
        });
        socket.end();
      },
    );

    socket.setTimeout(8000, () => {
      socket.destroy();
      finish({ ...empty, error: "TLS handshake timed out" });
    });

    socket.on("error", (error) => finish({ ...empty, error: error.message }));
    socket.on("close", () => finish({ ...empty, error: "connection closed before handshake" }));
  });
}

export interface RobotsReport {
  /** Whether the *inspected target* allows us to fetch it. */
  allowed: boolean;
  /** Why: matched rule, or "no robots.txt". */
  reason: string;
  fetched: boolean;
  status: number | null;
  sitemaps: string[];
  /** Directives that applied to our user agent. */
  matchedRules: string[];
  /** Raw file, truncated — shown so the user can verify the verdict. */
  raw: string | null;
}

/**
 * Parse robots.txt for our path.
 *
 * Longest-match wins, with `Allow` beating `Disallow` on a tie, per the
 * de-facto standard. Wildcards (`*`) and end anchors (`$`) are honoured.
 */
export async function readRobots(
  origin: URL,
  path: string,
  fetcher: (url: string) => Promise<{ status: number; body: string }>,
): Promise<RobotsReport> {
  const report: RobotsReport = {
    allowed: true,
    reason: "no robots.txt published — nothing is disallowed",
    fetched: false,
    status: null,
    sitemaps: [],
    matchedRules: [],
    raw: null,
  };

  const robotsUrl = new URL("/robots.txt", origin).toString();
  let body: string;
  try {
    const response = await fetcher(robotsUrl);
    report.status = response.status;
    report.fetched = true;
    if (response.status >= 400) {
      report.reason = `robots.txt returned ${response.status} — treated as unrestricted`;
      return report;
    }
    body = response.body;
  } catch {
    report.reason = "robots.txt could not be fetched — treated as unrestricted";
    return report;
  }

  if (!body.trim()) {
    report.reason = "robots.txt is empty — nothing is disallowed";
    return report;
  }

  report.raw = body.slice(0, 20_000);
  report.sitemaps = [...body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);

  // Collect the groups that apply to us (`User-agent: *` plus any NexusScope).
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value) current.rules.push({ allow: key === "allow", path: value });
    }
  }

  const toRegex = (pattern: string): RegExp => {
    const anchored = pattern.endsWith("$");
    const core = anchored ? pattern.slice(0, -1) : pattern;
    const escaped = core.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
  };

  const applicable = groups.filter(
    (group) => group.agents.includes("*") || group.agents.some((a) => a.includes("nexusscope")),
  );

  let best: { allow: boolean; length: number; rule: string } | null = null;
  for (const group of applicable) {
    for (const rule of group.rules) {
      if (!toRegex(rule.path).test(path)) continue;
      const length = rule.path.length;
      if (
        !best ||
        length > best.length ||
        (length === best.length && rule.allow && !best.allow)
      ) {
        best = { allow: rule.allow, length, rule: `${rule.allow ? "Allow" : "Disallow"}: ${rule.path}` };
      }
    }
  }

  if (best) {
    report.allowed = best.allow;
    report.matchedRules = [best.rule];
    report.reason = best.allow
      ? `${best.rule} explicitly permits this path`
      : `${best.rule} disallows this path for crawlers`;
  } else {
    report.reason = "no rule in robots.txt matches this path";
  }

  return report;
}

export interface TechFacts {
  /** Human-readable detections, e.g. "Next.js", "Cloudflare". */
  detected: Array<{ name: string; evidence: string; category: string }>;
}

/** Fingerprint from headers and markup — no active probing. */
export function detectTech(headers: Record<string, string>, html: string): TechFacts {
  const detected: Array<{ name: string; evidence: string; category: string }> = [];
  const add = (name: string, evidence: string, category: string) => {
    if (!detected.some((d) => d.name === name)) detected.push({ name, evidence, category });
  };

  const server = headers.server;
  if (server) add(server, `server: ${server}`, "server");

  const powered = headers["x-powered-by"];
  if (powered) add(powered, `x-powered-by: ${powered}`, "framework");

  if (headers["cf-ray"] || /cloudflare/i.test(server ?? "")) {
    add("Cloudflare", "cf-ray header", "cdn");
  }
  if (headers["x-vercel-id"] || headers["x-vercel-cache"]) add("Vercel", "x-vercel-* headers", "hosting");
  if (headers["x-amz-cf-id"]) add("Amazon CloudFront", "x-amz-cf-id header", "cdn");
  if (headers["x-azure-ref"]) add("Azure Front Door", "x-azure-ref header", "cdn");
  if (headers["x-fastly-request-id"]) add("Fastly", "x-fastly-request-id header", "cdn");

  if (headers["x-nextjs-cache"] || /__NEXT_DATA__|_next\/static/.test(html)) {
    add("Next.js", "__NEXT_DATA__ / _next assets", "framework");
  }
  if (/_nuxt\//.test(html)) add("Nuxt", "_nuxt assets", "framework");
  if (/__nuxt|data-v-app/.test(html)) add("Vue", "data-v-app attribute", "framework");
  if (/react(?:-dom)?[.@-]|data-reactroot|__REACT_DEVTOOLS/.test(html)) {
    add("React", "react markers", "framework");
  }
  if (/ng-version|ng-app/.test(html)) add("Angular", "ng-version attribute", "framework");
  if (/wp-content|wp-includes/.test(html)) add("WordPress", "wp-content paths", "cms");
  if (/cdn\.shopify\.com|Shopify\.theme/.test(html)) add("Shopify", "Shopify CDN references", "ecommerce");
  if (/squarespace/i.test(html)) add("Squarespace", "Squarespace markers", "site builder");
  if (/wix\.com|wixstatic/i.test(html)) add("Wix", "wixstatic assets", "site builder");
  if (/static\.parastorage\.com/.test(html)) add("Wix", "parastorage assets", "site builder");
  if (/googletagmanager\.com|gtag\(/.test(html)) add("Google Tag Manager", "gtag/GTM script", "analytics");
  if (/google-analytics\.com|analytics\.js/.test(html)) add("Google Analytics", "analytics.js", "analytics");
  if (/connect\.facebook\.net|fbq\(/.test(html)) add("Meta Pixel", "fbq/connect.facebook.net", "analytics");
  if (/hotjar/i.test(html)) add("Hotjar", "Hotjar script", "analytics");
  if (/clarity\.ms/.test(html)) add("Microsoft Clarity", "clarity.ms script", "analytics");
  if (/cloudflareinsights/.test(html)) add("Cloudflare Insights", "beacon script", "analytics");
  if (/jsdelivr|unpkg\.com|cdnjs\.cloudflare\.com/.test(html)) {
    add("Public CDN assets", "jsdelivr/unpkg/cdnjs references", "assets");
  }
  if (headers["strict-transport-security"]) {
    add("HSTS", "strict-transport-security header", "security");
  }
  if (/jquery/i.test(html)) add("jQuery", "jQuery reference", "library");
  if (/tailwind/i.test(html)) add("Tailwind CSS", "tailwind markers", "styling");
  if (/bootstrap/i.test(html)) add("Bootstrap", "bootstrap markers", "styling");

  const csp = headers["content-security-policy"];
  if (csp) add("Content-Security-Policy", "CSP header present", "security");

  return { detected };
}
