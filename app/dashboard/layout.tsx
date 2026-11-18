import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getProfile } from "@/lib/profile";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Library",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Without credentials there is no auth to check, so sending the visitor to
  // /login is correct — and far better than a stack trace from the Supabase
  // client. getProfile() already degrades, but the layout must not assume it can
  // render an authenticated shell.
  if (!isSupabaseConfigured()) redirect("/login?next=/dashboard");

  const profile = await getProfile();
  if (!profile) redirect("/login?next=/dashboard");

  return <AppShell profile={profile}>{children}</AppShell>;
}
