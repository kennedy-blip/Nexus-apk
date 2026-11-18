/**
 * Decoders for data a page *publishes*, not cryptography.
 *
 * A web page routinely ships encoded data to every anonymous visitor: base64
 * blobs in `data:` URIs, JWTs in localStorage boots or meta tags, HTML entities,
 * percent-encoding, JSON-LD, escaped JS string literals. All of it is plainly
 * readable by anyone who views source; it is only "hidden" by inconvenience.
 *
 * This module turns those payloads back into text so the report can show what
 * the site is actually handing out. Nothing here breaks a cipher, guesses a key,
 * or bypasses authentication — and the UI labels it "decoded", never "hacked".
 */

export type DecodeKind =
  | "base64"
  | "data-uri"
  | "jwt"
  | "html-entities"
  | "url-encoded"
  | "json"
  | "hex";

export interface DecodedBlob {
  kind: DecodeKind;
  /** Where it was found, e.g. `meta[og:image]` or `script[12]`. */
  source: string;
  /** A short excerpt of the raw payload, for context. */
  raw: string;
  /** The decoded value, or null when decoding produced nothing useful. */
  decoded: string | null;
  /** Extra facts — JWT claims, image mime/size, etc. */
  detail?: Record<string, unknown>;
}

/** Cheap printable-text test: a decoded blob that is mostly control bytes is noise. */
function looksLikeText(value: string): boolean {
  if (!value) return false;
  const sample = value.slice(0, 512);
  let printable = 0;
  for (const char of sample) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13) printable++;
    else if (code >= 32 && code !== 127) printable++;
  }
  return printable / sample.length > 0.85;
}

/** Percent/HTML-decoded output that is now valid JSON. */
function maybeJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return match;
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Decode a JWT *payload* only.
 *
 * This does not verify the signature — forging or verifying tokens is not what
 * an inspector does. It reveals the claims a site is already handing to the
 * browser, which is the same information devtools shows.
 */
export function decodeJwt(token: string): DecodedBlob | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  if (!/^[A-Za-z0-9_-]{8,}$/.test(parts[0])) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null) return null;

    return {
      kind: "jwt",
      source: "JWT",
      raw: token.length > 120 ? `${token.slice(0, 117)}…` : token,
      decoded: JSON.stringify(payload, null, 2),
      detail: {
        alg: (header as Record<string, unknown>).alg ?? null,
        typ: (header as Record<string, unknown>).typ ?? null,
        signaturePresent: parts[2].length > 0,
        /** Explicit, so nobody mistakes this for having "cracked" the token. */
        verified: false,
        note: "Signature not verified — these are the claims the site sent to your browser.",
      },
    };
  } catch {
    return null;
  }
}

/** `data:image/png;base64,…` → mime + byte length + (for textual mimes) content. */
export function decodeDataUri(uri: string, source: string): DecodedBlob | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if (!match) return null;

  const [, mime = "text/plain", isBase64, data = ""] = match;
  let bytes: Buffer;
  try {
    bytes = isBase64
      ? Buffer.from(decodeURIComponent(data), "base64")
      : Buffer.from(decodeURIComponent(data), "utf8");
  } catch {
    return null;
  }

  const textual = /^text\/|json|xml|javascript/i.test(mime);
  const decoded = textual ? bytes.toString("utf8").slice(0, 4000) : null;

  return {
    kind: "data-uri",
    source,
    raw: `${uri.slice(0, 80)}${uri.length > 80 ? "…" : ""}`,
    decoded,
    detail: {
      mime: mime || "text/plain",
      encoding: isBase64 ? "base64" : "plain",
      bytes: bytes.length,
      ...(textual ? {} : { note: "Binary payload — size and type reported, content not rendered." }),
    },
  };
}

/** A standalone base64 string that decodes to readable text. */
export function decodeBase64(candidate: string, source: string): DecodedBlob | null {
  const compact = candidate.replace(/\s+/g, "");
  // Too short to be interesting, or not base64 at all.
  if (compact.length < 16 || compact.length > 200_000) return null;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return null;

  try {
    const bytes = Buffer.from(compact, compact.includes("-") || compact.includes("_") ? "base64url" : "base64");
    if (bytes.length < 8) return null;
    const text = bytes.toString("utf8");
    if (!looksLikeText(text)) return null;
    const json = maybeJson(text);

    return {
      kind: "base64",
      source,
      raw: `${compact.slice(0, 72)}${compact.length > 72 ? "…" : ""}`,
      decoded: json ? JSON.stringify(json, null, 2) : text.slice(0, 4000),
      detail: { bytes: bytes.length, ...(json ? { format: "json" } : {}) },
    };
  } catch {
    return null;
  }
}

/** Hex-encoded ASCII, e.g. `48656c6c6f` → `Hello`. */
export function decodeHex(candidate: string, source: string): DecodedBlob | null {
  const compact = candidate.replace(/\s+/g, "");
  if (compact.length < 16 || compact.length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/i.test(compact)) return null;

  const text = Buffer.from(compact, "hex").toString("utf8");
  if (!looksLikeText(text) || !/[a-z]{3}/i.test(text)) return null;

  return {
    kind: "hex",
    source,
    raw: `${compact.slice(0, 72)}${compact.length > 72 ? "…" : ""}`,
    decoded: text.slice(0, 4000),
    detail: { bytes: text.length },
  };
}

/**
 * Find encoded payloads anywhere in a document.
 *
 * Runs targeted extractors (data URIs, JWTs) and a bounded generic sweep for
 * base64/hex runs, then de-duplicates. Bounded on purpose: a pathological page
 * with 50k candidate strings must not turn into a CPU sink.
 */
export function extractEncodedPayloads(html: string, maxResults = 30): DecodedBlob[] {
  const found: DecodedBlob[] = [];
  const seen = new Set<string>();

  const push = (blob: DecodedBlob | null) => {
    if (!blob) return;
    const key = `${blob.kind}:${blob.raw.slice(0, 100)}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(blob);
  };

  // 1. data: URIs (images, fonts, inline text).
  const dataUris = html.match(/data:[a-z0-9.+/-]+(?:;base64)?,[A-Za-z0-9+/=%._-]{16,}/gi) ?? [];
  for (const uri of dataUris.slice(0, 12)) push(decodeDataUri(uri, "inline data: URI"));

  // 2. JWTs — three base64url segments with a JSON header.
  const jwtCandidates = html.match(/eyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g) ?? [];
  for (const token of jwtCandidates.slice(0, 8)) push(decodeJwt(token));

  // 3. Generic base64 runs. Long minimum keeps prose and hashes out.
  const base64Runs = html.match(/[A-Za-z0-9+/]{40,}={0,2}/g) ?? [];
  for (const run of base64Runs.slice(0, 40)) push(decodeBase64(run, "base64 string"));

  // 4. Hex runs.
  const hexRuns = html.match(/\b[0-9a-fA-F]{32,}\b/g) ?? [];
  for (const run of hexRuns.slice(0, 20)) push(decodeHex(run, "hex string"));

  return found.slice(0, maxResults);
}
