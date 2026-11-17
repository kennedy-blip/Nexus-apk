import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlaygroundView } from "@/components/playground/playground-view";
import type { ApkRecord, SessionEvent, SessionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const { sessionId } = await params;
  return { title: `Playground · ${sessionId.slice(0, 8)}` };
}

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/playground/${sessionId}`);

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) notFound();

  const { data: apk } = await supabase
    .from("apks")
    .select("*")
    .eq("id", (session as SessionRecord).apk_id)
    .maybeSingle();

  if (!apk) notFound();

  const { data: events } = await supabase
    .from("session_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("id", { ascending: true })
    .limit(120);

  return (
    <PlaygroundView
      session={session as SessionRecord}
      apk={apk as ApkRecord}
      initialEvents={(events ?? []) as SessionEvent[]}
    />
  );
}
