/**
 * Site origin resolution.
 *
 * `metadataBase` (canonical URLs, OpenGraph images) used to fall back to
 * `http://localhost:3000`, so a production deploy advertised localhost in every
 * absolute URL it generated. Resolution order:
 *
 *  1. `NEXT_PUBLIC_SITE_URL` — explicit operator choice, e.g. a custom domain
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's stable production domain
 *  3. `VERCEL_URL` — the specific deployment
 *  4. localhost, for `npm run dev`
 *
 * Vercel exposes those two without a scheme, so they are normalised to https.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return withScheme(explicit);

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return withScheme(production);

  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return withScheme(deployment);

  return "http://localhost:3000";
}

function withScheme(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Absolute URL for a same-origin path, safe to emit in metadata. */
export function absoluteUrl(path: string): string {
  const base = siteUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
