import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client bound to the request cookie jar.
 * Safe inside Server Components, Route Handlers and Server Actions.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail with an actionable message instead of @supabase's generic
  // "Your project's URL and Key are required", which gives no hint about which
  // variable is missing or where it should be set.
  if (!url || !anonKey) {
    throw new Error(
      `Supabase is not configured: ${[
        !url && "NEXT_PUBLIC_SUPABASE_URL",
        !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ]
        .filter(Boolean)
        .join(" and ")} ${!url && !anonKey ? "are" : "is"} unset. Add it to .env.local (see .env.example) or the Vercel project's environment variables.`,
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — middleware refreshes the
            // session instead, so swallowing here is correct.
          }
        },
      },
    },
  );
}

/**
 * The privileged key, if one is configured.
 *
 * Accepts both key generations: the project publishes a legacy `service_role`
 * JWT and a newer `sb_secret_…` key, and either grants full access.
 */
export function adminKey(): string | null {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  return key && key.length > 0 ? key : null;
}

/**
 * Privileged client — bypasses RLS. SERVER ONLY, never import in a client file.
 *
 * Throws when no privileged key is configured instead of quietly falling back
 * to the anon key: an anon "admin" client silently returns empty result sets
 * and failed writes, which is far harder to diagnose than a loud error.
 * Callers that can degrade should check `isAdminConfigured()` first.
 */
export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  const key = adminKey();
  if (!key) {
    throw new Error(
      "A privileged Supabase key is required (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY)",
    );
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isAdminConfigured() {
  return Boolean(adminKey() && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** True when auth can work at all. Pages use this to degrade instead of throwing. */
export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
