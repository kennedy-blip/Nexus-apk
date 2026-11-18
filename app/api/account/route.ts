import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * DELETE /api/account
 *
 * Self-service account deletion.
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

  // 1. delete this user's inspections. RLS scopes the delete to the owner, and
  //    the explicit filter means it can never touch another account's rows.
  const { error: inspectionError } = await supabase
    .from("inspections")
    .delete()
    .eq("owner_id", user.id);

  if (inspectionError) {
    return NextResponse.json(
      { error: "Could not delete your inspections", detail: inspectionError.message },
      { status: 500 },
    );
  }

  // 2. delete the auth user (cascades profiles and any remaining rows)
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
    // Without a service key we can still erase the data the user owns; the auth
    // identity must be removed by an operator.
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
