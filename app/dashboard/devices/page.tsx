import type { Metadata } from "next";
import { orchestratorConfig, orchestratorHealth } from "@/lib/backend";
import { GlassCard } from "@/components/ui/glass-card";
import { DEVICE_PROFILES } from "@/lib/types";
import { Cpu, MonitorSmartphone, Server, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Devices" };
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const config = orchestratorConfig();
  const health = config.configured
    ? await orchestratorHealth()
    : { ok: false, detail: "orchestrator not configured" };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">
          Device fleet
        </h1>
        <p className="mt-1 text-[13.5px] text-zinc-500">
          Available Android profiles and the compute backing them.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {Object.values(DEVICE_PROFILES).map((device) => (
          <GlassCard key={device.id} interactive edge className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 text-indigo-300">
                <MonitorSmartphone className="h-4 w-4" />
              </span>
              <span className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                available
              </span>
            </div>
            <h3 className="text-[14px] font-semibold text-white">{device.label}</h3>
            <dl className="mt-2 space-y-1 font-mono text-[11px] text-zinc-500">
              <div className="flex justify-between">
                <dt>display</dt>
                <dd className="text-zinc-300">
                  {device.width}×{device.height}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>density</dt>
                <dd className="text-zinc-300">{device.dpi} dpi</dd>
              </div>
              <div className="flex justify-between">
                <dt>ratio</dt>
                <dd className="text-zinc-300">{device.ratio.toFixed(3)}</dd>
              </div>
            </dl>
          </GlassCard>
        ))}
      </div>

      <GlassCard variant="strong" className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
            <Server className="h-4 w-4 text-indigo-300" />
            Orchestrator
          </h2>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10.5px] uppercase tracking-wide",
              health.ok
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
                : "border-amber-400/25 bg-amber-500/10 text-amber-300",
            )}
          >
            {health.ok ? "healthy" : "offline"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Info
            icon={Cpu}
            label="Mode"
            value={config.configured ? "cloud (redroid)" : "browser simulator"}
          />
          <Info
            icon={Server}
            label="Containers"
            value={health.containers !== undefined ? String(health.containers) : "—"}
          />
          <Info
            icon={ShieldCheck}
            label="Transport"
            value={config.configured ? "WebRTC + WS" : "canvas"}
          />
        </div>

        {!config.configured && (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] leading-relaxed text-zinc-400">
            Set <code className="font-mono text-zinc-200">NEXUS_BACKEND_URL</code> and{" "}
            <code className="font-mono text-zinc-200">NEXUS_BACKEND_TOKEN</code> to
            connect the FastAPI orchestrator in <code className="font-mono text-zinc-200">backend/</code>.
            Until then, sessions run on the built-in canvas simulator so the whole
            workspace stays fully interactive.
          </p>
        )}
        {health.detail && (
          <p className="mt-2 font-mono text-[11px] text-zinc-600">{health.detail}</p>
        )}
      </GlassCard>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-zinc-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1.5 text-[13px] font-medium text-zinc-200">{value}</p>
    </div>
  );
}
