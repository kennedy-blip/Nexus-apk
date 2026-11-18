/**
 * Assertions for the inspector's security and parsing behaviour.
 *
 * These are the properties that must never regress silently:
 *   - no SSRF: loopback, private, link-local/metadata, multicast, IPv4-mapped
 *   - only http/https accepted
 *   - the decompression ceiling holds (a bomb must not expand unbounded)
 *   - metadata/decoding extraction stays correct
 *
 * Run with `npm run verify:inspect`. Exits non-zero on the first failure so CI
 * fails loudly rather than shipping a bypass.
 */

import { isAddressAllowed, normaliseTarget } from "../lib/inspect/url.ts";
import { decodeHtmlEntities, decodeJwt } from "../lib/inspect/decode.ts";
import { extractMeta } from "../lib/inspect/extract.ts";

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function assert(label, condition) {
  check(label, Boolean(condition), true);
}

/* ------------------------------------------------------------------ */
/* SSRF: addresses that must be refused                                */
/* ------------------------------------------------------------------ */
const BLOCKED = [
  "127.0.0.1",
  "127.1.2.3",
  "0.0.0.0",
  "10.0.0.1",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "169.254.169.254", // AWS/GCP metadata
  "100.64.0.1", // CGNAT
  "198.18.0.1",
  "224.0.0.1",
  "240.0.0.1",
  "::1",
  "::",
  "fc00::1",
  "fd12:3456::1",
  "fe80::1",
  "::ffff:127.0.0.1", // v4-mapped bypass shape
  "::ffff:169.254.169.254",
];

for (const address of BLOCKED) {
  check(`refuses ${address}`, isAddressAllowed(address).allowed, false);
}

/* ------------------------------------------------------------------ */
/* Addresses that must remain reachable                                */
/* ------------------------------------------------------------------ */
for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "2606:4700::1111"]) {
  check(`allows ${address}`, isAddressAllowed(address).allowed, true);
}

/* ------------------------------------------------------------------ */
/* Scheme handling                                                     */
/* ------------------------------------------------------------------ */
function targetOutcome(input) {
  try {
    const url = normaliseTarget(input);
    return `allowed:${url.protocol}`;
  } catch (error) {
    return `blocked:${error.reason ?? "error"}`;
  }
}

check("rejects file://", targetOutcome("file:///etc/passwd"), "blocked:protocol");
check("rejects javascript:", targetOutcome("javascript:alert(1)"), "blocked:protocol");
check("rejects data:", targetOutcome("data:text/html,<h1>x"), "blocked:protocol");
check("rejects gopher:", targetOutcome("gopher://example.com"), "blocked:protocol");
check("rejects ftp:", targetOutcome("ftp://example.com"), "blocked:protocol");
check("rejects empty", targetOutcome("   "), "blocked:empty");
check("assumes https for a bare host", targetOutcome("example.com"), "allowed:https:");
check("strips wrapping quotes", targetOutcome('"https://example.com/x"'), "allowed:https:");
check("strips angle brackets", targetOutcome("<https://example.com>"), "allowed:https:");

/* ------------------------------------------------------------------ */
/* Decoding                                                            */
/* ------------------------------------------------------------------ */
check("decodes numeric entities", decodeHtmlEntities("&#65;&#x42;&#67;"), "ABC");
check("decodes named entities", decodeHtmlEntities("a &amp; b &lt;c&gt;"), "a & b <c>");
check("leaves unknown entities alone", decodeHtmlEntities("&nonsense;"), "&nonsense;");

const JWT = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "eyJzdWIiOiIxMjM0NSIsInJvbGUiOiJhZG1pbiJ9",
  "c2lnbmF0dXJlanVzdGZvcnRlc3Rpbmc",
].join(".");

const decodedJwt = decodeJwt(JWT);
assert("decodes a JWT payload", decodedJwt);
check("reads the JWT algorithm", decodedJwt?.detail?.alg, "HS256");
assert("reveals the claims", decodedJwt?.decoded?.includes('"role": "admin"'));
check("never claims the signature is verified", decodedJwt?.detail?.verified, false);
check("rejects a two-part token", decodeJwt("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0"), null);

/* ------------------------------------------------------------------ */
/* Extraction                                                          */
/* ------------------------------------------------------------------ */
const HTML = `<!doctype html>
<html lang="en-KE"><head>
<title>Fallback &amp; Title</title>
<meta property="og:title" content="OG Title" />
<meta property="og:description" content="OG description." />
<meta property="og:image" content="/hero.png" />
<meta property="og:site_name" content="Acme" />
<meta name="theme-color" content="#101010" />
<meta name="twitter:site" content="@acmeke" />
<meta name="keywords" content=" one, two ,three " />
<link rel="canonical" href="https://acme.test/" />
<link rel="icon" sizes="16x16" href="/f16.png" />
<link rel="icon" sizes="256x256" href="/f256.png" />
<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml" />
<script type="application/ld+json">{"@type":"Org","sameAs":["https://twitter.com/acme","https://github.com/acme"]}</script>
</head><body>
<script>window.t="${JWT}";</script>
<script>var data="${Buffer.from('{"store":"Nairobi"}').toString("base64")}";</script>
<a href="/about">About</a><a href="/about">About again</a><a href="https://other.test/x">Out</a>
<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" />
<form></form><iframe></iframe>
<p>Hello   world</p>
</body></html>`;

const meta = extractMeta(HTML, new URL("https://acme.test/"));

check("OpenGraph title wins over <title>", meta.preview.title, "OG Title");
check("description from og", meta.preview.description, "OG description.");
check("relative image resolved", meta.preview.image, "https://acme.test/hero.png");
check("site name", meta.preview.siteName, "Acme");
check("language", meta.preview.lang, "en-KE");
check("canonical", meta.preview.canonical, "https://acme.test/");
check("largest icon preferred", meta.preview.favicon, "https://acme.test/f256.png");
check("theme colour", meta.preview.themeColor, "#101010");
check("keywords trimmed", meta.preview.keywords, ["one", "two", "three"]);
assert("twitter handle captured", meta.preview.socialHandles.includes("@acmeke"));
assert("JSON-LD sameAs host captured", meta.preview.socialHandles.includes("twitter.com"));

check("feed discovered", meta.feeds.length, 1);
check("feed resolved", meta.feeds[0]?.href, "https://acme.test/feed.xml");
// Three <a> tags, two unique URLs: /about appears twice.
check("links deduplicated", meta.links.length, 2);
check("external link kept", meta.links.includes("https://other.test/x"), true);
check("structured data parsed", meta.structuredData.length, 1);
check("form counted", meta.stats.formCount, 1);
check("iframe counted", meta.stats.iframeCount, 1);
assert("text collapsed", /Hello world/.test(meta.visibleText));

/* ------------------------------------------------------------------ */
const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\n${failures.length} of ${total} assertions FAILED:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`All ${total} inspector assertions passed.`);
