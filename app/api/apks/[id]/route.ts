import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/apks/:id — single record + short-lived download URL. */
export async function GET(
  _request: Request,
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
  const { data: signed } = await supabase.storage
    .from(bucket)
    .createSignedUrl(apk.storage_path, 60 * 10);

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
