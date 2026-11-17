import { createClient } from "@/lib/supabase/server";
import { LibraryView } from "@/components/dashboard/library-view";
import type { ApkRecord, SessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: apks }, { data: sessions }] = await Promise.all([
    supabase.from("apks").select("*").order("created_at", { ascending: false }),
    supabase
      .from("sessions")
      .select("*")
      .in("state", ["pending", "provisioning", "installing", "running"])
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <LibraryView
      initialApks={(apks ?? []) as ApkRecord[]}
      activeSessions={(sessions ?? []) as SessionRecord[]}
    />
  );
}
