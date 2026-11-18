/**
 * Report types + the inspection pipeline.
 *
 * The report is intentionally explicit about *availability*: every optional
 * section carries either a value or a stated reason it is missing. A field that
 * could not be read is `null` with a note — never a plausible-looking default.
 * That rule exists because this project already shipped one playground that
 * invented its metrics, and that was worse than showing nothing.
 */

import { safeFetch, type FetchResult } from "./fetch";
import { extractEncodedPayloads, type DecodedBlob } from "./decode";
import { extractMeta, type ExtractedMeta } from "./extract";
import { detectTech, inspectTls, readRobots, resolveDns, type DnsReport, type RobotsReport, type TechFacts, type TlsReport } from "./infra";
import { BlockedTargetError } from "./url";

export interface SecurityHeader {
  name: string;
  present: boolean;
  value: string | null;
  /** Why it matters, in one line. */
  note: string;
}

export interface UrlPart {
  label: string;
  value: string;
}

export interface InspectionReport {
  /** Echo of what the user typed. */
  input: string;
  finalUrl: string;
  inspectedAt: string;
  durationMs: number;
  status: number;
  statusText: string;
  contentType: string | null;
  bodyBytes: number;
  truncated: boolean;

  redirects: FetchResult["hops"];
  addresses: string[];

  preview: ExtractedMeta["preview"];
  metaTags: ExtractedMeta["metaTags"];
  structuredData: unknown[];
  feeds: ExtractedMeta["feeds"];
  stats: ExtractedMeta["stats"];
  visibleText: string;

  urlParts: UrlPart[];
  queryParams: Array<{ key: string; value: string }>;

  headers: Record<string, string>;
  securityHeaders: SecurityHeader[];
  cookies: Array<{ name: string; attributes: string; flags: string[] }>;

  dns: DnsReport | null;
  dnsError: string | null;
  tls: TlsReport | null;
  tlsError: string | null;
  robots: RobotsReport | null;
  robotsError: string | null;
  tech: TechFacts;

  decoded: DecodedBlob[];

  /** External destinations the page links to, grouped by host. */
  outboundHosts: Array<{ host: string; count: number }>;

  /** Traffic-light summary. */
  signals: Array<{ level: "good" | "warn" | "bad" | "info"; label: string; detail: string }>;

  /** Stated limitations of this run. Always populated. */
  notes: string[];
}

const SECURITY_HEADER_SPECS: Array<{ name: string; note: string }> = [
  { name: "strict-transport-security", note: "Forces HTTPS for future visits" },
  { name: "content-security-policy", note: "Restricts which scripts and origins may run" },
  { name: "x-content-type-options", note: "Stops browsers guessing content types" },
  { name: "x-frame-options", note: "Controls whether the page may be framed" },
  { name: "referrer-policy", note: "Limits referrer leakage to third parties" },
  { name: "permissions-policy", note: "Restricts camera, microphone, geolocation" },
  { name: "cross-origin-opener-policy", note: "Isolates the page from cross-origin windows" },
];

function parseCookies(setCookie: string | undefined): InspectionReport["cookies"] {
  if (!setCookie) return [];
  // `set-cookie` is joined with ", " by our header normaliser; split on the
  // comma that begins a new cookie (i.e. followed by `name=`).
  const parts = setCookie.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
  return parts.slice(0, 20).map((part) => {
    const [pair, ...rest] = part.split(";");
    const name = pair.split("=")[0]?.trim() ?? "";
    const attributes = rest.join(";").trim();
    const flags: string[] = [];
    if (/;\s*secure/i.test(part)) flags.push("Secure");
    if (/;\s*httponly/i.test(part)) flags.push("HttpOnly");
    if (/;\s*samesite=/i.test(part)) {
      flags.push(`SameSite=${/;\s*samesite=([^;]+)/i.exec(part)?.[1]?.trim() ?? ""}`);
    }
    return { name, attributes, flags };
  });
}

function buildSignals(report: Omit<InspectionReport, "signals">): InspectionReport["signals"] {
  const signals: InspectionReport["signals"] = [];

  const has = (name: string) => Boolean(report.headers[name]);
  if (report.finalUrl.startsWith("https://")) {
    signals.push({ level: "good", label: "Served over HTTPS", detail: "The page itself was encrypted in transit." });
  } else {
    signals.push({ level: "bad", label: "Plain HTTP", detail: "Content is readable and modifiable by anyone on the network path." });
  }

  if (report.tls?.expired) {
    signals.push({ level: "bad", label: "Certificate expired", detail: `Expired ${report.tls.daysRemaining?.toString() ?? ""} days ago.` });
  } else if (report.tls && report.tls.daysRemaining !== null && report.tls.daysRemaining < 14) {
    signals.push({ level: "warn", label: "Certificate expiring soon", detail: `${report.tls.daysRemaining} days remaining.` });
  } else if (report.tls?.available) {
    signals.push({ level: "good", label: "Valid certificate", detail: `Issued by ${report.tls.issuer ?? "unknown CA"}, ${report.tls.daysRemaining} days remaining.` });
  }

  if (!has("strict-transport-security")) {
    signals.push({ level: "warn", label: "No HSTS", detail: "A downgrade to plain HTTP is possible on first visit." });
  }
  if (!has("content-security-policy")) {
    signals.push({ level: "warn", label: "No CSP", detail: "Any injected script would run with full page privileges." });
  }
  if (!has("x-content-type-options")) {
    signals.push({ level: "warn", label: "No nosniff", detail: "Browsers may treat a non-script file as a script." });
  }

  const permissionHeaders = report.headers["permissions-policy"] ?? report.headers["feature-policy"];
  if (!permissionHeaders) {
    signals.push({ level: "info", label: "No Permissions-Policy", detail: "Camera/microphone/geolocation restrictions are not declared." });
  }

  if (report.robots && !report.robots.allowed) {
    signals.push({ level: "warn", label: "robots.txt disallows this path", detail: report.robots.reason });
  }

  if (report.redirects.length > 0) {
    const crossHost = report.redirects.some((hop) => {
      try {
        return new URL(hop.url).hostname !== new URL(report.finalUrl).hostname;
      } catch {
        return false;
      }
    });
    signals.push({
      level: crossHost ? "warn" : "info",
      label: `${report.redirects.length} redirect${report.redirects.length === 1 ? "" : "s"}`,
      detail: crossHost ? "The chain crosses to a different host — worth checking where it ends up." : "Stayed on the same host.",
    });
  }

  if (report.contentType && /text\/html/.test(report.contentType)) {
    const shell = report.stats.textLength < 400 && report.stats.scriptCount > 3;
    if (shell) {
      signals.push({
        level: "info",
        label: "JavaScript-rendered page",
        detail: "Almost no server-rendered text — the visible content is assembled by scripts, so some fields may be thin.",
      });
    }
    if (/log ?in|sign ?in|create an account/i.test(report.visibleText.slice(0, 600)) && report.stats.textLength < 1500) {
      signals.push({
        level: "warn",
        label: "Login wall",
        detail: "This URL returns a sign-in prompt to anonymous visitors. Only the public shell is visible.",
      });
    }
  }

  if (report.stats.formCount > 0 && !report.finalUrl.startsWith("https://")) {
    signals.push({ level: "bad", label: "Form on plain HTTP", detail: "Credentials submitted here would travel in clear text." });
  }

  return signals;
}

/**
 * Build the URL breakdown: every component, plus decoded query parameters.
 */
function describeUrl(url: URL): { urlParts: UrlPart[]; queryParams: Array<{ key: string; value: string }> } {
  const urlParts: UrlPart[] = [
    { label: "Scheme", value: url.protocol.replace(":", "") },
    { label: "Host", value: url.hostname },
    { label: "Port", value: url.port || (url.protocol === "https:" ? "443 (default)" : "80 (default)") },
    { label: "Path", value: url.pathname || "/" },
    { label: "Query", value: url.search || "(none)" },
    { label: "Fragment", value: url.hash || "(none)" },
  ];

  const queryParams: Array<{ key: string; value: string }> = [];
  for (const [key, value] of url.searchParams.entries()) {
    queryParams.push({ key, value });
  }

  return { urlParts, queryParams };
}

export async function inspect(rawInput: string): Promise<InspectionReport> {
  const started = Date.now();

  // `safeFetch` throws BlockedTargetError for anything disallowed; the route
  // turns that into a 400 with the stated reason.
  const fetched = await safeFetch(rawInput);
  const base = fetched.finalUrl;
  const isHtml = /text\/html|application\/xhtml/i.test(fetched.contentType ?? "");

  const meta: ExtractedMeta = isHtml
    ? extractMeta(fetched.body, base)
    : {
        preview: {
          title: null,
          description: null,
          canonical: null,
          siteName: null,
          lang: null,
          image: null,
          imageAlt: null,
          type: null,
          themeColor: null,
          favicon: null,
          author: null,
          publishedTime: null,
          socialHandles: [],
          keywords: [],
        },
        feeds: [],
        metaTags: [],
        links: [],
        stats: {
          scriptCount: 0,
          inlineScriptBytes: 0,
          imageCount: 0,
          linkCount: 0,
          iframeCount: 0,
          formCount: 0,
          textLength: 0,
        },
        structuredData: [],
        visibleText: "",
      };

  const { urlParts, queryParams } = describeUrl(base);

  const securityHeaders: SecurityHeader[] = SECURITY_HEADER_SPECS.map((spec) => {
    const value = fetched.headers[spec.name] ?? null;
    return { name: spec.name, present: Boolean(value), value, note: spec.note };
  });

  // --- infrastructure, in parallel -------------------------------------
  const [dnsResult, tlsResult, robotsResult] = await Promise.allSettled([
    resolveDns(base.hostname, fetched.addresses),
    base.protocol === "https:" ? inspectTls(base.hostname, Number(base.port || 443), fetched.addresses[0]) : Promise.resolve(null),
    readRobots(base, `${base.pathname}${base.search}`, async (url) => {
      const hop = await safeFetch(url);
      return { status: hop.status, body: hop.body };
    }),
  ]);

  const dns = dnsResult.status === "fulfilled" ? dnsResult.value : null;
  const tls = tlsResult.status === "fulfilled" ? tlsResult.value : null;
  const robots = robotsResult.status === "fulfilled" ? robotsResult.value : null;

  // --- outbound destinations -------------------------------------------
  const hostCounts = new Map<string, number>();
  for (const link of meta.links) {
    try {
      const host = new URL(link).hostname;
      if (host === base.hostname) continue;
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
    } catch {
      /* ignore malformed */
    }
  }
  const outboundHosts = [...hostCounts.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  const reportWithoutSignals: Omit<InspectionReport, "signals"> = {
    input: rawInput,
    finalUrl: base.toString(),
    inspectedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    status: fetched.status,
    statusText: fetched.statusText,
    contentType: fetched.contentType,
    bodyBytes: fetched.bodyBytes,
    truncated: fetched.truncated,
    redirects: fetched.hops,
    addresses: fetched.addresses,
    preview: meta.preview,
    metaTags: meta.metaTags.slice(0, 200),
    structuredData: meta.structuredData.slice(0, 10),
    feeds: meta.feeds,
    stats: meta.stats,
    visibleText: meta.visibleText,
    urlParts,
    queryParams,
    headers: fetched.headers,
    securityHeaders,
    cookies: parseCookies(fetched.headers["set-cookie"]),
    dns,
    dnsError: dnsResult.status === "rejected" ? String(dnsResult.reason) : null,
    tls,
    tlsError: tlsResult.status === "rejected" ? String(tlsResult.reason) : null,
    robots,
    robotsError: robotsResult.status === "rejected" ? String(robotsResult.reason) : null,
    tech: detectTech(fetched.headers, fetched.body),
    decoded: isHtml ? extractEncodedPayloads(fetched.body) : [],
    outboundHosts,
    notes: [],
  };

  const notes: string[] = [];
  notes.push(
    "Everything here was served to an anonymous visitor. Logged-in, private and follower-only content is not accessible and is not attempted.",
  );
  if (!isHtml) {
    notes.push(`The response was ${fetched.contentType ?? "not HTML"}, so page metadata, links and structured data were not parsed.`);
  }
  if (fetched.truncated) {
    notes.push("The response body exceeded 5 MB and was truncated; extraction covers the first 5 MB only.");
  }
  if (reportWithoutSignals.decoded.length === 0 && isHtml) {
    notes.push("No encoded payloads (base64, JWT, hex) were found in the markup.");
  }
  if (tls && !tls.available) {
    notes.push(`TLS inspection failed: ${tls.error ?? "unknown reason"}.`);
  }
  if (robots && !robots.allowed) {
    notes.push(`robots.txt disallows this path, but fetching was already complete — the result is shown and the verdict recorded. Honour it if you intend to automate.`);
  }
  notes.push("JavaScript was not executed, so content injected at runtime by scripts is not included.");

  const report = { ...reportWithoutSignals, notes };
  return { ...report, signals: buildSignals(report) };
}

export { BlockedTargetError };
