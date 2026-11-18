import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  parseApk,
  validateApkBuffer,
  iconBufferFromDataUrl,
  APK_LIMITS,
} from "@/lib/apk-parser";
import type { ApkRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/apks — library listing for the signed-in user.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("apks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Could not load library", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ apks: (data ?? []) as ApkRecord[] });
}

/**
 * POST /api/apks — multipart ingest.
 *
 * Streams the binary to Supabase Storage first (so a huge APK never has to be
 * buffered twice), then parses the manifest for metadata. Parsing failures are
 * non-fatal: the APK still lands in the library marked as needing a re-scan.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > APK_LIMITS.maxBytes) {
    return NextResponse.json(
      {
        error: `APK exceeds the ${(APK_LIMITS.maxBytes / 1024 / 1024).toFixed(0)} MB limit`,
        code: "too_large",
      },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validationError = validateApkBuffer(buffer, file.name);
  if (validationError) {
    return NextResponse.json({ error: validationError, code: "invalid_apk" }, { status: 415 });
  }

  const parsed = await parseApk(buffer);

  const bucket = process.env.NEXUS_APK_BUCKET ?? "apks";
  const objectId = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const storagePath = `${user.id}/${objectId}/${safeName}`;
  const iconPath = parsed.iconDataUrl ? `${user.id}/${objectId}/icon.png` : null;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: "application/vnd.android.package-archive",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Storage upload failed", detail: uploadError.message },
      { status: 502 },
    );
  }

  // Icon lives beside the APK so it can be served with the same RLS policy.
  if (parsed.iconDataUrl && iconPath) {
    const iconBytes = iconBufferFromDataUrl(parsed.iconDataUrl);
    if (iconBytes) {
      await supabase.storage
        .from(bucket)
        .upload(iconPath, iconBytes, {
          contentType: "image/png",
          cacheControl: "31536000",
          upsert: true,
        })
        .catch(() => undefined);
    }
  }

  const displayName =
    parsed.appName ?? file.name.replace(/\.apk$/i, "").replace(/[_-]+/g, " ");

  const { data: row, error: insertError } = await supabase
    .from("apks")
    .insert({
      owner_id: user.id,
      display_name: displayName,
      package_name: parsed.packageName,
      version_name: parsed.versionName,
      version_code: parsed.versionCode,
      min_sdk: parsed.minSdk,
      target_sdk: parsed.targetSdk,
      size_bytes: buffer.byteLength,
      sha256: parsed.sha256,
      storage_path: storagePath,
      icon_path: iconPath,
      status: "ready",
    })
    .select("*")
    .single();

  if (insertError || !row) {
    // Roll back the orphaned object so storage doesn't leak.
    await supabase.storage.from(bucket).remove([storagePath]).catch(() => undefined);
    return NextResponse.json(
      { error: "Could not save APK metadata", detail: insertError?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ apk: row as ApkRecord }, { status: 201 });
}
