import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Strip anything that could break a Content-Disposition header. */
function safeFilename(name: string, fallback: string): string {
  const cleaned = name.replace(/[\r\n"\\]/g, "").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * GET /api/apks/:id
 *
 * Two callers, two shapes:
 *
 *  - `?download=1` streams the APK itself, so a plain link or `download`
 *    attribute yields a real `.apk` file. This previously returned JSON to the
 *    browser, which looked like the download was broken.
 *  - anything else returns the record plus a short-lived signed URL, for the
 *    dashboard and the playground metadata banner.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: apk, error } = await supabase
    .from("apks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!apk) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bucket = process.env.NEXUS_APK_BUCKET ?? "apks";
  const wantsFile = new URL(request.url).searchParams.get("download") !== null;

  const { data: signed } = await supabase.storage
    .from(bucket)
    .createSignedUrl(apk.storage_path, wantsFile ? 60 : 60 * 10);

  if (wantsFile) {
    if (!signed?.signedUrl) {
      return NextResponse.json(
        { error: "Could not sign a download URL for this APK" },
        { status: 502 },
      );
    }

    // Redirect rather than buffering: a 300 MB APK must never pass through a
    // serverless function's memory or its response body limit.
    return new NextResponse(null, {
      status: 302,
      headers: {
        location: signed.signedUrl,
        "content-disposition": `attachment; filename="${safeFilename(
          `${apk.display_name ?? "app"}.apk`,
          "app.apk",
        )}"`,
        "cache-control": "no-store",
      },
    });
  }

  return NextResponse.json({ apk, downloadUrl: signed?.signedUrl ?? null });
}

/** DELETE /api/apks/:id — removes the row plus every stored object. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: apk } = await supabase
    .from("apks")
    .select("id, storage_path, icon_path")
    .eq("id", id)
    .maybeSingle();

  if (!apk) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bucket = process.env.NEXUS_APK_BUCKET ?? "apks";
  const paths = [apk.storage_path, apk.icon_path].filter(Boolean) as string[];
  if (paths.length) {
    await supabase.storage.from(bucket).remove(paths);
  }

  const { error } = await supabase.from("apks").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
