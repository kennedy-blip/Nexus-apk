/**
 * A deliberately small HTTP client for the inspector.
 *
 * `fetch` is not usable here: it neither lets us pin the resolved address nor
 * re-validate each redirect hop, and it silently follows redirects into private
 * space. This module uses `node:http`/`node:https` directly so that:
 *
 *   1. redirects are followed manually, one hop at a time, each re-validated;
 *   2. the socket is pinned to the address we already vetted, which closes the
 *      DNS-rebinding window between "check" and "connect";
 *   3. the response body is capped, because a few endpoints stream terabytes or
 *      never terminate;
 *   4. a whole-request deadline applies, since a hostile server can drip bytes
 *      forever and beat any body-size cap.
 */

import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { BlockedTargetError, assertPublicHost, normaliseTarget } from "./url";

export interface Hop {
  url: string;
  status: number;
  statusText: string;
  location?: string;
  durationMs: number;
}

export interface FetchResult {
  /** The URL that finally returned a body. */
  finalUrl: URL;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Decoded response text (may be truncated). */
  body: string;
  bodyBytes: number;
  truncated: boolean;
  contentType: string | null;
  /** Every redirect followed, in order. */
  hops: Hop[];
  /** Addresses the final host resolved to — shown in the report. */
  addresses: string[];
  durationMs: number;
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; NexusScope/1.0; +https://nexusapk-studio.vercel.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Hard limits.
 *
 * `MAX_BODY_BYTES` applies to the **decompressed** body. Capping the compressed
 * stream instead is a decompression-bomb hole: the npm registry, for instance,
 * serves 31 MB of JSON as a ~1 MB gzip payload, which sailed straight past a
 * compressed-byte cap and would OOM a serverless function. Decompression is now
 * streamed with its own ceiling.
 */
const MAX_REDIRECTS = 8;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

/** Only these content types are decoded as text; binaries are reported, not read. */
const TEXTUAL = /^(text\/|application\/(json|xml|javascript|x-javascript|ld\+json|rss\+xml|atom\+xml|xhtml\+xml))/i;

/**
 * Decompress with a hard output ceiling.
 *
 * Streams the decompressor into a buffer, aborting the moment the ceiling is
 * hit, so a bomb costs `limit` bytes of memory rather than gigabytes. The
 * partial result is returned and flagged as truncated.
 */
async function decompressCapped(
  raw: Buffer,
  encoding: string,
  limit: number,
): Promise<{ body: Buffer; truncated: boolean }> {
  const lower = encoding.toLowerCase();
  // All three constructors return a duplex Transform, so one union type covers
  // the read and write sides we use below.
  type Decompressor = zlib.Gunzip | zlib.BrotliDecompress | zlib.Inflate;
  let stream: Decompressor | null = null;
  if (lower.includes("br")) stream = zlib.createBrotliDecompress();
  else if (lower.includes("gzip")) stream = zlib.createGunzip();
  else if (lower.includes("deflate")) stream = zlib.createInflate();

  // Nothing to do for identity encodings or an unknown scheme.
  if (!stream) return { body: raw, truncated: raw.length > limit };

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (truncated: boolean) => {
      if (settled) return;
      settled = true;
      stream?.destroy();
      resolve({ body: Buffer.concat(chunks).subarray(0, limit), truncated });
    };

    stream!.on("data", (chunk: Buffer) => {
      if (settled) return;
      const remaining = limit - total;
      if (chunk.length >= remaining) {
        chunks.push(chunk.subarray(0, Math.max(0, remaining)));
        total = limit;
        finish(true);
        return;
      }
      chunks.push(chunk);
      total += chunk.length;
    });

    stream!.on("end", () => finish(total >= limit));
    // Corrupt or truncated streams still yield whatever decoded cleanly.
    stream!.on("error", () => finish(total >= limit));

    stream!.write(raw);
    stream!.end();
  });
}

interface RawResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  durationMs: number;
}

/**
 * One HTTP round trip to an already-vetted URL.
 *
 * `address` is pinned through a custom `lookup` so the connection cannot
 * re-resolve to a different (private) address after validation.
 */
async function requestOnce(
  url: URL,
  address: string,
  family: number,
  signalBreaker: AbortSignal,
): Promise<RawResponse> {
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;
  const started = Date.now();

  return new Promise<RawResponse>((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: isHttps ? url.hostname : undefined,
        headers: {
          "user-agent": USER_AGENT,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
          "accept-language": "en-US,en;q=0.9",
          "accept-encoding": "gzip, deflate, br",
          connection: "close",
        },
        // Pin to the vetted address regardless of what DNS says now.
        //
        // Node 20+ enables `autoSelectFamily`, which calls this with
        // `options.all === true` and expects an *array* of {address, family}.
        // Returning a bare address there throws "Invalid IP address: undefined".
        lookup: (_hostname, options, callback) => {
          type LookupCb = (
            err: NodeJS.ErrnoException | null,
            address: string | Array<{ address: string; family: number }>,
            family?: number,
          ) => void;
          const done = callback as unknown as LookupCb;
          if (options && (options as { all?: boolean }).all) {
            done(null, [{ address, family }]);
            return;
          }
          done(null, address, family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        let truncated = false;

        res.on("data", (chunk: Buffer) => {
          if (truncated) return;
          received += chunk.length;
          if (received >= MAX_BODY_BYTES) {
            truncated = true;
            const remaining = Math.max(0, MAX_BODY_BYTES - (received - chunk.length));
            chunks.push(chunk.subarray(0, remaining));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const encoding = String(res.headers["content-encoding"] ?? "");

          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            headers[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
          }

          void decompressCapped(raw, encoding, MAX_BODY_BYTES).then((decoded) => {
            resolve({
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? "",
              headers,
              body: decoded.body,
              // Truncated if the compressed stream was cut *or* the expanded
              // body exceeded the ceiling.
              truncated: truncated || decoded.truncated,
              durationMs: Date.now() - started,
            });
          });
        });

        res.on("error", reject);
      },
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });

    req.on("error", (error) => reject(error));

    // Wire the outer deadline to this request.
    signalBreaker.addEventListener("abort", () => {
      req.destroy(new Error("request deadline exceeded"));
    });

    req.end();
  });
}

/**
 * Fetch a user-supplied URL safely: validate, resolve, pin, follow redirects
 * manually, cap the body, decode text.
 */
export async function safeFetch(input: string): Promise<FetchResult> {
  const started = Date.now();
  const controller = new AbortController();

  let current = normaliseTarget(input);
  const hops: Hop[] = [];
  const deadline = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS * (MAX_REDIRECTS + 1),
  );

  try {
    for (let hopIndex = 0; hopIndex <= MAX_REDIRECTS; hopIndex++) {
      const vetted = await assertPublicHost(current.hostname);
      const hopStarted = Date.now();

      const raw = await requestOnce(current, vetted.address, vetted.family, controller.signal);
      const isRedirect = raw.status >= 300 && raw.status < 400 && raw.headers.location;

      if (!isRedirect) {
        const contentType = raw.headers["content-type"] ?? null;
        const textual = contentType === null || TEXTUAL.test(contentType);
        const bodyText = textual ? raw.body.toString("utf8") : "";

        return {
          finalUrl: current,
          status: raw.status,
          statusText: raw.statusText,
          headers: raw.headers,
          body: bodyText,
          bodyBytes: raw.body.length,
          truncated: raw.truncated,
          contentType,
          hops,
          addresses: vetted.addresses,
          durationMs: Date.now() - started,
        };
      }

      // Record the hop before following it.
      const next = new URL(raw.headers.location, current);
      hops.push({
        url: current.toString(),
        status: raw.status,
        statusText: raw.statusText,
        location: next.toString(),
        durationMs: Date.now() - hopStarted,
      });

      // The redirect target is user-influenced input from a third party, so it
      // gets exactly the same scrutiny as the original URL.
      current = normaliseTarget(next.toString());
      void hopStarted;
    }

    throw new BlockedTargetError(
      `Too many redirects (more than ${MAX_REDIRECTS})`,
      "redirect-loop",
    );
  } finally {
    clearTimeout(deadline);
  }
}
