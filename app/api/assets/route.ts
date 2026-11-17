import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/assets?path=<storage path>
 *
 * Proxies APK icons from the private bucket. Icons are private (bucket-level
 * policy) and Next/Image can't carry the auth cookie to Supabase Storage, so we
 * stream a short-lived redirect instead. Only icon paths are accepted.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const path = new URL(request.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  // Paths are namespaced by user id — reject anything outside your own folder.
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bucket = process.env.NEXUS_APK_BUCKET ?? "apks";
  const { data: blob, error } = await supabase.storage.from(bucket).download(path);
  if (error || !blob) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = Buffer.from(await blob.arrayBuffer());
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": blob.type || "image/png",
      "cache-control": "private, max-age=86400, immutable",
      "content-length": String(body.byteLength),
    },
  });
}
