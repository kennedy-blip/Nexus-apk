import type { Metadata } from "next";
import { InspectorWorkspace } from "@/components/inspect/inspector-workspace";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = {
  title: "Inspector",
  description:
    "Inspect any public URL: preview metadata, redirects, DNS, TLS, security headers and decoded payloads.",
};

export default async function InspectPage() {
  // Reachable signed out on purpose — the public demo. The API applies a small
  // anonymous allowance; a signed-in account has none.
  const profile = await getProfile();

  return <InspectorWorkspace signedIn={Boolean(profile)} />;
}
