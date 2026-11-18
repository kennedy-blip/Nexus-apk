import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = {
  title: "Library",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/dashboard");

  return <AppShell profile={profile}>{children}</AppShell>;
}
