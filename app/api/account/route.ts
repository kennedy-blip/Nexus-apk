import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * DELETE /api/account
 *
 * Self-service account deletion. Storage objects are removed explicitly because
 * deleting the auth user cascades the *rows* but not the bucket contents.
 *
 * Requires an authenticated session; the browser must confirm with a typed
 * phrase before calling this (see the settings view).
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bucket = process.env.NEXUS_APK_BUCKET ?? "apks";

  // 1. collect every object this user owns (RLS scopes the listing)
  const { data: apks } = await supabase.from("apks").select("storage_path, icon_path");
  const paths = (apks ?? []).flatMap((row) =>
    [row.storage_path, row.icon_path].filter(Boolean),
  ) as string[];

  if (paths.length > 0) {
    // Chunked so a large library does not exceed the storage API limits.
    for (let i = 0; i < paths.length; i += 100) {
      await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
    }
  }

  // 2. purge the whole user folder as a belt-and-braces sweep
  const { data: folderObjects } = await supabase.storage.from(bucket).list(user.id);
  if (folderObjects && folderObjects.length > 0) {
    await supabase.storage
      .from(bucket)
      .remove(folderObjects.map((item) => `${user.id}/${item.name}`));
  }

  // 3. delete the auth user (cascades profiles/apks/sessions/events)
  if (isAdminConfigured()) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      return NextResponse.json(
        { error: "Could not delete account", detail: error.message },
        { status: 500 },
      );
    }
  } else {
    // Without a service key we can still erase the data the user owns; the
    // auth identity must be removed by an operator.
    await supabase.from("apks").delete().eq("owner_id", user.id);
    await supabase.auth.signOut();
    return NextResponse.json({
      ok: true,
      partial: true,
      message:
        "Your data was deleted. The auth identity requires SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
