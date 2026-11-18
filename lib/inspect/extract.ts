/**
 * HTML metadata extraction.
 *
 * Deliberately dependency-free and regex-based rather than a full DOM parse:
 * the input is untrusted and frequently malformed, and we only need flat facts
 * (meta tags, title, feeds, links). Anything structure-dependent is reported as
 * "not found" rather than guessed.
 */

import { decodeHtmlEntities } from "./decode";

export interface LinkPreview {
  title: string | null;
  description: string | null;
  canonical: string | null;
  siteName: string | null;
  lang: string | null;
  /** OpenGraph + Twitter card values, merged by preference. */
  image: string | null;
  imageAlt: string | null;
  type: string | null;
  themeColor: string | null;
  favicon: string | null;
  /** @username / author surfaced in the markup, if any. */
  author: string | null;
  publishedTime: string | null;
  /** Social handles discovered via meta or JSON-LD. */
  socialHandles: string[];
  keywords: string[];
}

export interface Feed {
  title: string | null;
  href: string;
}

export interface ExtractedMeta {
  preview: LinkPreview;
  feeds: Feed[];
  /** All meta name/property -> content pairs, for the raw table. */
  metaTags: Array<{ key: string; content: string }>;
  /** Outbound links found in the document (deduped, capped). */
  links: string[];
  /** Counts used for a cheap "what is this page" fingerprint. */
  stats: {
    scriptCount: number;
    inlineScriptBytes: number;
    imageCount: number;
    linkCount: number;
    iframeCount: number;
    formCount: number;
    /** Rough visible-text length, for a content-vs-shell judgement. */
    textLength: number;
  };
  /** Raw JSON-LD blocks, parsed when valid. */
  structuredData: unknown[];
  /** Rendered text, collapsed — used for the text view. */
  visibleText: string;
}

/** Decode the handful of entities that appear inside attribute values. */
function attr(value: string): string {
  return decodeHtmlEntities(value).trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(input: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(input);
    if (match?.[1]) {
      const value = attr(match[1]);
      if (value) return value;
    }
  }
  return null;
}

/** Resolve a possibly-relative URL against the final page URL. */
export function resolveUrl(value: string | null, base: URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function extractMeta(html: string, base: URL): ExtractedMeta {
  const metaTags: Array<{ key: string; content: string }> = [];

  // Every <meta> tag, in document order.
  const metaPattern = /<meta\b([^>]*?)\/?>/gi;
  for (const match of html.matchAll(metaPattern)) {
    const attrs = match[1];
    const key =
      /(?:name|property|itemprop)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const rawKey = key?.[1] ?? key?.[2] ?? key?.[3];
    const rawContent = content?.[1] ?? content?.[2] ?? content?.[3];
    if (rawKey && rawContent) {
      metaTags.push({ key: attr(rawKey).toLowerCase(), content: attr(rawContent) });
    }
  }

  const meta = (key: string): string | null =>
    metaTags.find((tag) => tag.key === key)?.content ?? null;

  const title =
    firstMatch(html, [/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i]) ??
    firstMatch(html, [/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i]) ??
    firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]) ??
    meta("og:title");

  const description =
    meta("og:description") ??
    meta("description") ??
    meta("twitter:description") ??
    null;

  const keywords = (meta("keywords") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 20);

  const image = resolveUrl(
    meta("og:image") ??
      meta("og:image:secure_url") ??
      meta("twitter:image") ??
      meta("twitter:image:src"),
    base,
  );

  const canonical = resolveUrl(
    firstMatch(html, [/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i]) ??
      meta("og:url"),
    base,
  );

  // rel=icon variants, preferring the largest declared size.
  const iconCandidates: Array<{ href: string; sizes: number }> = [];
  for (const match of html.matchAll(/<link\b([^>]*rel=["'][^"']*icon[^"']*["'][^>]*)>/gi)) {
    const attrs = match[1];
    const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const sizes = /sizes\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const sizeSpec = sizes?.[1] ?? sizes?.[2] ?? "";
    const largest = sizeSpec
      .split(/\s+/)
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n))
      .reduce((max, n) => Math.max(max, n), 0);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (value) iconCandidates.push({ href: attr(value), sizes: largest });
  }
  iconCandidates.sort((a, b) => b.sizes - a.sizes);
  const favicon = resolveUrl(
    iconCandidates[0]?.href ?? meta("msapplication-TileImage"),
    base,
  ) ?? resolveUrl("/favicon.ico", base);

  // Feeds.
  const feeds: Feed[] = [];
  for (const match of html.matchAll(
    /<link\b([^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*)>/gi,
  )) {
    const attrs = match[1];
    const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const feedTitle = /title\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    const resolved = resolveUrl(value ? attr(value) : null, base);
    if (resolved) {
      feeds.push({ title: feedTitle?.[1] ? attr(feedTitle[1]) : null, href: resolved });
    }
  }

  // Structured data.
  const structuredData: unknown[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const payload = match[1].trim();
    try {
      structuredData.push(JSON.parse(payload));
    } catch {
      // Some sites emit multiple JSON objects in one block; try to salvage.
      for (const candidate of payload.split(/\}\s*\{/)) {
        try {
          structuredData.push(JSON.parse(candidate.startsWith("{") ? candidate : `{${candidate}`));
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Social handles from meta tags and JSON-LD sameAs.
  const handles = new Set<string>();
  for (const tag of metaTags) {
    if (/(twitter:creator|twitter:site|article:author)$/.test(tag.key)) {
      const value = tag.content.trim();
      if (value.startsWith("@")) handles.add(value);
      else {
        const handle = /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{2,})/.exec(value)?.[1];
        if (handle) handles.add(`@${handle}`);
      }
    }
  }
  const collectSameAs = (node: unknown): void => {
    // `sameAs` is usually an array of bare URL strings, so strings must be
    // handled before the object/array branches — otherwise every host is
    // silently dropped.
    if (typeof node === "string") {
      const host = /^https?:\/\/(?:www\.)?([a-z0-9.-]+)/i.exec(node)?.[1];
      if (host) handles.add(host);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(collectSameAs);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.sameAs !== undefined) collectSameAs(record.sameAs);
    Object.values(record).forEach(collectSameAs);
  };
  structuredData.forEach(collectSameAs);

  const links: string[] = [];
  const seenLinks = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const resolved = resolveUrl(attr(match[1] ?? match[2] ?? ""), base);
    if (!resolved || seenLinks.has(resolved)) continue;
    seenLinks.add(resolved);
    links.push(resolved);
    if (links.length >= 300) break;
  }

  const count = (pattern: RegExp) => (html.match(pattern) ?? []).length;
  const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  const inlineScriptBytes = inlineScripts.reduce((total, m) => total + m[1].length, 0);

  const visibleText = stripTags(html);

  return {
    preview: {
      title,
      description,
      canonical,
      siteName: meta("og:site_name") ?? meta("application-name"),
      lang: firstMatch(html, [/<html[^>]+lang=["']([^"']*)["']/i]),
      image,
      imageAlt: meta("og:image:alt") ?? meta("twitter:image:alt"),
      type: meta("og:type"),
      themeColor: meta("theme-color"),
      favicon,
      author: meta("author") ?? meta("article:author") ?? meta("twitter:creator"),
      publishedTime: meta("article:published_time") ?? meta("datePublished"),
      socialHandles: [...handles].slice(0, 12),
      keywords,
    },
    feeds,
    metaTags,
    links,
    stats: {
      scriptCount: count(/<script\b/gi),
      inlineScriptBytes,
      imageCount: count(/<img\b/gi),
      linkCount: links.length,
      iframeCount: count(/<iframe\b/gi),
      formCount: count(/<form\b/gi),
      textLength: visibleText.length,
    },
    structuredData,
    visibleText: visibleText.slice(0, 20_000),
  };
}
