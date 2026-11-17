import type { Metadata } from "next";
import { getProfile } from "@/lib/profile";
import { GlassCard } from "@/components/ui/glass-card";
import { formatBytes } from "@/lib/utils";
import { DangerZone } from "@/components/settings/danger-zone";
import { sessionTtlSeconds } from "@/lib/session-policy";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfile();

  const ttl = sessionTtlSeconds();

  const limits = [
    {
      label: "Session lease",
      // Signed-in accounts are unrestricted; only ops can opt into a TTL.
      value: ttl === null ? "Unlimited — ends when you stop" : `${Math.round(ttl / 60)} minutes`,
    },
    {
      label: "Max APK size",
      value: formatBytes(Number(process.env.NEXUS_MAX_UPLOAD_BYTES ?? 512 * 1024 * 1024), 0),
    },
    { label: "Storage bucket", value: process.env.NEXUS_APK_BUCKET ?? "apks" },
    { label: "Plan", value: profile?.plan ?? "free" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">Settings</h1>
        <p className="mt-1 text-[13.5px] text-zinc-500">
          Account identity and what applies to your workspace. Signed-in
          sessions have no time limit; the demo tour is the only bounded view.
        </p>
      </div>

      <GlassCard className="mb-3 p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-white">Account</h2>
        <div className="space-y-2.5 text-[12.5px]">
          <Row label="Email" value={profile?.email ?? "—"} />
          <Row label="Name" value={profile?.full_name ?? "—"} />
          <Row label="User ID" value={profile?.id ?? "—"} mono />
        </div>
      </GlassCard>

      <GlassCard className="mb-3 p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-white">Workspace limits</h2>
        <div className="space-y-2.5">
          {limits.map((l) => (
            <Row key={l.label} label={l.label} value={l.value} />
          ))}
        </div>
      </GlassCard>

      <GlassCard className="mb-3 p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-white">Session</h2>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12.5px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.1]"
          >
            Sign out of this device
          </button>
        </form>
      </GlassCard>

      <DangerZone />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className={`truncate text-right text-zinc-200 ${mono ? "font-mono text-[11.5px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
