"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Binary,
  CheckCircle2,
  ChevronDown,
  Code2,
  Cookie,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Info,
  Link2,
  Lock,
  Network,
  ScanLine,
  Server,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";
import type { InspectionReport } from "@/lib/inspect/report";

/* ------------------------------------------------------------------ */
/* primitives                                                          */
/* ------------------------------------------------------------------ */

function Section({
  id,
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = false,
}: {
  id: string;
  title: string;
  icon: React.ElementType;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GlassCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`section-${id}`}
        className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Icon className="h-4 w-4 shrink-0 text-indigo-300" />
        <span className="flex-1 text-[13.5px] font-semibold text-white">{title}</span>
        {count !== undefined && (
          <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
            {count}
          </span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <motion.div
          id={`section-${id}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="border-t border-white/[0.06] px-4 py-3.5"
        >
          {children}
        </motion.div>
      )}
    </GlassCard>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/[0.04] py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-40 shrink-0 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 break-words text-[13px] text-zinc-200",
          mono && "font-mono text-[12px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const SIGNAL_STYLES = {
  good: { icon: CheckCircle2, className: "text-emerald-400", border: "border-emerald-400/25 bg-emerald-400/[0.06]" },
  warn: { icon: AlertTriangle, className: "text-amber-400", border: "border-amber-400/25 bg-amber-400/[0.06]" },
  bad: { icon: XCircle, className: "text-rose-400", border: "border-rose-400/25 bg-rose-400/[0.06]" },
  info: { icon: Info, className: "text-sky-400", border: "border-sky-400/25 bg-sky-400/[0.06]" },
} as const;

/* ------------------------------------------------------------------ */
/* report                                                              */
/* ------------------------------------------------------------------ */

export function ReportView({ report }: { report: InspectionReport }) {
  const [tab, setTab] = useState<"preview" | "audit" | "decoded" | "raw">("preview");

  const host = useMemo(() => {
    try {
      return new URL(report.finalUrl).hostname;
    } catch {
      return report.finalUrl;
    }
  }, [report.finalUrl]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexusscope-${host}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "preview" as const, label: "Preview", icon: Link2 },
    { id: "audit" as const, label: "Audit", icon: ShieldCheck },
    { id: "decoded" as const, label: "Decoded", icon: Binary },
    { id: "raw" as const, label: "Raw", icon: Code2 },
  ];

  return (
    <div className="space-y-4">
      {/* -------- header -------- */}
      <GlassCard variant="strong" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold",
                  report.status >= 200 && report.status < 300
                    ? "bg-emerald-400/15 text-emerald-300"
                    : report.status >= 400
                      ? "bg-rose-400/15 text-rose-300"
                      : "bg-amber-400/15 text-amber-300",
                )}
              >
                {report.status || "—"} {report.statusText}
              </span>
              <span className="truncate text-[13px] font-medium text-zinc-300">{host}</span>
              <a
                href={report.finalUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-zinc-500 transition-colors hover:text-white"
                aria-label="Open in a new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <h2 className="mt-1.5 truncate text-[17px] font-semibold text-white">
              {report.preview.title ?? host}
            </h2>
            {report.preview.description && (
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">
                {report.preview.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={exportJson}>
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
          </div>
        </div>

        {/* facts strip */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-zinc-500">
          <span>{formatBytes(report.bodyBytes)}{report.truncated ? " (truncated)" : ""}</span>
          <span>{report.durationMs} ms</span>
          <span>{report.redirects.length} redirect{report.redirects.length === 1 ? "" : "s"}</span>
          {report.tls?.daysRemaining !== null && report.tls?.daysRemaining !== undefined && (
            <span>cert {report.tls.daysRemaining}d left</span>
          )}
          {report.decoded.length > 0 && <span>{report.decoded.length} payloads decoded</span>}
        </div>

        {/* signals */}
        {report.signals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report.signals.map((signal) => {
              const style = SIGNAL_STYLES[signal.level];
              return (
                <span
                  key={`${signal.level}-${signal.label}`}
                  title={signal.detail}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-medium",
                    style.border,
                    style.className,
                  )}
                >
                  <style.icon className="h-3 w-3" />
                  {signal.label}
                </span>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* -------- tabs -------- */}
      <div className="flex gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
              tab === item.id ? "text-white" : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            {tab === item.id && (
              <motion.span
                layoutId="report-tab"
                className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.07]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <item.icon className="relative z-10 h-3.5 w-3.5" />
            <span className="relative z-10">{item.label}</span>
          </button>
        ))}
      </div>

      {/* -------- preview tab -------- */}
      {tab === "preview" && (
        <div className="space-y-3">
          {report.preview.image && (
            <GlassCard className="overflow-hidden">
              <img
                src={report.preview.image}
                alt={report.preview.imageAlt ?? "Preview image"}
                className="max-h-[280px] w-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="flex items-center gap-2 px-3 py-2">
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <span className="truncate font-mono text-[11px] text-zinc-500">
                  {report.preview.image}
                </span>
                <CopyButton text={report.preview.image} />
              </div>
            </GlassCard>
          )}

          <Section id="og" title="Link preview fields" icon={Link2} defaultOpen>
            <Row label="Title" value={report.preview.title ?? <em className="text-zinc-500">not published</em>} />
            <Row
              label="Description"
              value={report.preview.description ?? <em className="text-zinc-500">not published</em>}
            />
            <Row label="Site name" value={report.preview.siteName ?? <em className="text-zinc-500">—</em>} />
            <Row label="Type" value={report.preview.type ?? <em className="text-zinc-500">—</em>} />
            <Row label="Language" value={report.preview.lang ?? <em className="text-zinc-500">—</em>} />
            <Row
              label="Canonical"
              value={
                report.preview.canonical ? (
                  <span className="flex items-center gap-2">
                    <span className="truncate font-mono text-[12px]">{report.preview.canonical}</span>
                    <CopyButton text={report.preview.canonical} />
                  </span>
                ) : (
                  <em className="text-zinc-500">—</em>
                )
              }
            />
            <Row label="Author" value={report.preview.author ?? <em className="text-zinc-500">—</em>} />
            <Row
              label="Published"
              value={report.preview.publishedTime ?? <em className="text-zinc-500">—</em>}
            />
            <Row
              label="Theme colour"
              value={
                report.preview.themeColor ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded border border-white/20"
                      style={{ background: report.preview.themeColor }}
                    />
                    <span className="font-mono text-[12px]">{report.preview.themeColor}</span>
                  </span>
                ) : (
                  <em className="text-zinc-500">—</em>
                )
              }
            />
          </Section>

          {report.preview.socialHandles.length > 0 && (
            <Section
              id="handles"
              title="Accounts & profiles"
              icon={Globe}
              count={report.preview.socialHandles.length}
              defaultOpen
            >
              <div className="flex flex-wrap gap-1.5">
                {report.preview.socialHandles.map((handle) => (
                  <span
                    key={handle}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[12px] text-zinc-300"
                  >
                    {handle}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {report.preview.keywords.length > 0 && (
            <Section id="keywords" title="Keywords" icon={FileText} count={report.preview.keywords.length}>
              <div className="flex flex-wrap gap-1.5">
                {report.preview.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11.5px] text-zinc-400"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {report.feeds.length > 0 && (
            <Section id="feeds" title="Feeds" icon={FileText} count={report.feeds.length}>
              {report.feeds.map((feed) => (
                <Row key={feed.href} label={feed.title ?? "Feed"} value={<span className="font-mono text-[12px]">{feed.href}</span>} />
              ))}
            </Section>
          )}

          {report.visibleText && (
            <Section id="text" title="Visible text" icon={FileText}>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-300">
                {report.visibleText.slice(0, 6000)}
                {report.visibleText.length > 6000 && "…"}
              </p>
            </Section>
          )}
        </div>
      )}

      {/* -------- audit tab -------- */}
      {tab === "audit" && (
        <div className="space-y-3">
          <Section id="chain" title="Redirect chain" icon={ArrowRight} defaultOpen count={report.redirects.length}>
            {report.redirects.length === 0 ? (
              <p className="text-[12.5px] text-zinc-400">
                No redirects — the URL served the page directly.
              </p>
            ) : (
              <ol className="space-y-2">
                {report.redirects.map((hop, index) => (
                  <li key={`${hop.url}-${index}`} className="flex items-start gap-2">
                    <span className="mt-0.5 rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-400">
                      {hop.status}
                    </span>
                    <div className="min-w-0">
                      <p className="break-all font-mono text-[11.5px] text-zinc-300">{hop.url}</p>
                      <p className="text-[11px] text-zinc-500">
                        {hop.durationMs} ms → {hop.location}
                      </p>
                    </div>
                  </li>
                ))}
                <li className="flex items-start gap-2 border-t border-white/[0.06] pt-2">
                  <span className="mt-0.5 rounded bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[10.5px] text-emerald-300">
                    {report.status}
                  </span>
                  <p className="break-all font-mono text-[11.5px] text-zinc-300">{report.finalUrl}</p>
                </li>
              </ol>
            )}
          </Section>

          <Section id="tls" title="TLS certificate" icon={Lock} defaultOpen>
            {report.tls?.available ? (
              <>
                <Row label="Issuer" value={report.tls.issuer ?? "—"} />
                <Row label="Subject" value={report.tls.subject ?? "—"} />
                <Row label="Protocol" value={report.tls.protocol ?? "—"} />
                <Row label="Cipher" value={report.tls.cipher ?? "—"} mono />
                <Row label="Valid from" value={report.tls.validFrom ?? "—"} />
                <Row
                  label="Expires"
                  value={
                    <span
                      className={cn(
                        report.tls.expired
                          ? "text-rose-400"
                          : (report.tls.daysRemaining ?? 99) < 14
                            ? "text-amber-400"
                            : "text-zinc-200",
                      )}
                    >
                      {report.tls.validTo ?? "—"}
                      {report.tls.daysRemaining !== null && ` (${report.tls.daysRemaining} days)`}
                    </span>
                  }
                />
                <Row
                  label="Covers"
                  value={
                    <span className="flex flex-wrap gap-1">
                      {report.tls.altNames.slice(0, 20).map((name) => (
                        <span key={name} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px]">
                          {name}
                        </span>
                      ))}
                    </span>
                  }
                />
              </>
            ) : (
              <p className="text-[12.5px] text-amber-400">
                {report.tlsError ?? report.tls?.error ?? "TLS was not inspected (the page is not HTTPS)."}
              </p>
            )}
          </Section>

          <Section id="dns" title="DNS records" icon={Network}>
            {report.dns ? (
              <>
                <Row label="A" value={report.dns.a.join(", ") || "—"} mono />
                <Row label="AAAA" value={report.dns.aaaa.join(", ") || "—"} mono />
                <Row label="CNAME" value={report.dns.cname.join(", ") || "—"} mono />
                <Row label="Nameservers" value={report.dns.ns.join(", ") || "—"} mono />
                <Row
                  label="Mail"
                  value={
                    report.dns.mx.length > 0
                      ? report.dns.mx.map((m) => `${m.exchange} (${m.priority})`).join(", ")
                      : "—"
                  }
                  mono
                />
                <Row label="TXT" value={report.dns.txt.length > 0 ? report.dns.txt.join(" · ") : "—"} mono />
                {report.dns.caa.length > 0 && (
                  <Row
                    label="CAA"
                    value={report.dns.caa.map((c) => `${c.tag} ${c.value}`).join(", ")}
                    mono
                  />
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-amber-400">{report.dnsError ?? "DNS lookup failed."}</p>
            )}
          </Section>

          <Section id="sec-headers" title="Security headers" icon={ShieldAlert} defaultOpen>
            <div className="space-y-1.5">
              {report.securityHeaders.map((header) => (
                <div key={header.name} className="flex items-start gap-2">
                  {header.present ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400/70" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11.5px] text-zinc-200">{header.name}</p>
                    <p className="text-[11px] text-zinc-500">{header.note}</p>
                    {header.value && (
                      <p className="mt-0.5 break-all font-mono text-[10.5px] text-zinc-500">
                        {header.value.slice(0, 300)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="robots" title="robots.txt" icon={ScanLine}>
            {report.robots ? (
              <>
                <Row
                  label="Verdict"
                  value={
                    <span className={report.robots.allowed ? "text-emerald-400" : "text-amber-400"}>
                      {report.robots.allowed ? "Allowed" : "Disallowed"} — {report.robots.reason}
                    </span>
                  }
                />
                {report.robots.sitemaps.length > 0 && (
                  <Row label="Sitemaps" value={report.robots.sitemaps.join(", ")} mono />
                )}
                {report.robots.raw && (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-black/40 p-2.5 font-mono text-[11px] leading-relaxed text-zinc-400">
                    {report.robots.raw}
                  </pre>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-amber-400">{report.robotsError ?? "robots.txt was not read."}</p>
            )}
          </Section>

          <Section id="tech" title="Technology" icon={Server} count={report.tech.detected.length}>
            {report.tech.detected.length === 0 ? (
              <p className="text-[12.5px] text-zinc-400">No technologies were identified from headers or markup.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {report.tech.detected.map((item) => (
                  <span
                    key={item.name}
                    title={item.evidence}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[12px] text-zinc-300"
                  >
                    {item.name}
                    <span className="ml-1 text-[10.5px] text-zinc-500">{item.category}</span>
                  </span>
                ))}
              </div>
            )}
          </Section>

          {report.cookies.length > 0 && (
            <Section id="cookies" title="Cookies set" icon={Cookie} count={report.cookies.length}>
              {report.cookies.map((cookie, index) => (
                <div key={`${cookie.name}-${index}`} className="border-b border-white/[0.04] py-1.5 last:border-0">
                  <p className="font-mono text-[12px] text-zinc-200">{cookie.name}</p>
                  <p className="text-[11px] text-zinc-500">{cookie.attributes || "no attributes"}</p>
                  {cookie.flags.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {cookie.flags.map((flag) => (
                        <span
                          key={flag}
                          className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10.5px] text-zinc-400"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {report.outboundHosts.length > 0 && (
            <Section
              id="outbound"
              title="Outbound destinations"
              icon={Globe}
              count={report.outboundHosts.length}
            >
              <p className="mb-2 text-[11.5px] text-zinc-500">
                External hosts this page links to — where a visitor can be sent next.
              </p>
              <div className="space-y-1">
                {report.outboundHosts.map((item) => (
                  <div key={item.host} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11.5px] text-zinc-300">{item.host}</span>
                    <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-zinc-400">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section id="urlparts" title="URL breakdown" icon={Link2}>
            {report.urlParts.map((part) => (
              <Row key={part.label} label={part.label} value={part.value} mono />
            ))}
            {report.queryParams.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-zinc-500">
                  Query parameters
                </p>
                {report.queryParams.map((param) => (
                  <div key={param.key} className="flex gap-2 border-b border-white/[0.04] py-1 last:border-0">
                    <span className="w-32 shrink-0 truncate font-mono text-[11.5px] text-indigo-300">
                      {param.key}
                    </span>
                    <span className="min-w-0 break-all font-mono text-[11.5px] text-zinc-300">
                      {param.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* -------- decoded tab -------- */}
      {tab === "decoded" && (
        <div className="space-y-3">
          <GlassCard className="p-3.5">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              <span className="font-semibold text-zinc-200">Decoded, not decrypted.</span>{" "}
              These are payloads the page already sends to every visitor, turned back into
              readable text — base64, hex, JWT claim sections and HTML entities. No cipher is
              broken and no login is bypassed. JWT signatures are not verified.
            </p>
          </GlassCard>

          {report.decoded.length === 0 ? (
            <GlassCard className="p-6 text-center">
              <Binary className="mx-auto h-5 w-5 text-zinc-600" />
              <p className="mt-2 text-[13px] text-zinc-400">
                No encoded payloads were found in this page&apos;s markup.
              </p>
            </GlassCard>
          ) : (
            report.decoded.map((blob, index) => (
              <GlassCard key={`${blob.kind}-${index}`} className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase text-indigo-300">
                    {blob.kind}
                  </span>
                  <span className="text-[11.5px] text-zinc-500">{blob.source}</span>
                  {typeof blob.detail?.bytes === "number" && (
                    <span className="text-[11px] text-zinc-600">{blob.detail.bytes} bytes</span>
                  )}
                </div>

                <p className="mt-2 break-all rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[10.5px] text-zinc-500">
                  {blob.raw}
                </p>

                {blob.decoded ? (
                  <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-emerald-300/90">
                    {blob.decoded}
                  </pre>
                ) : (
                  <p className="mt-1.5 text-[11.5px] text-zinc-500">
                    Binary or opaque payload — size and type reported, content not rendered.
                  </p>
                )}

                {blob.detail?.note ? (
                  <p className="mt-1.5 text-[11px] text-amber-400/80">{String(blob.detail.note)}</p>
                ) : null}
              </GlassCard>
            ))
          )}
        </div>
      )}

      {/* -------- raw tab -------- */}
      {tab === "raw" && (
        <div className="space-y-3">
          <Section id="headers" title="Response headers" icon={Code2} defaultOpen count={Object.keys(report.headers).length}>
            {Object.entries(report.headers).map(([key, value]) => (
              <div key={key} className="border-b border-white/[0.04] py-1.5 last:border-0">
                <span className="font-mono text-[11.5px] text-indigo-300">{key}</span>
                <p className="break-all font-mono text-[11px] text-zinc-400">{String(value).slice(0, 500)}</p>
              </div>
            ))}
          </Section>

          <Section id="meta" title="Meta tags" icon={Code2} count={report.metaTags.length}>
            {report.metaTags.length === 0 ? (
              <p className="text-[12.5px] text-zinc-400">None.</p>
            ) : (
              report.metaTags.map((tag, index) => (
                <div key={`${tag.key}-${index}`} className="flex gap-2 border-b border-white/[0.04] py-1 last:border-0">
                  <span className="w-40 shrink-0 truncate font-mono text-[11px] text-indigo-300">{tag.key}</span>
                  <span className="min-w-0 break-all font-mono text-[11px] text-zinc-400">{tag.content}</span>
                </div>
              ))
            )}
          </Section>

          <Section id="jsonld" title="Structured data (JSON-LD)" icon={Code2} count={report.structuredData.length}>
            {report.structuredData.length === 0 ? (
              <p className="text-[12.5px] text-zinc-400">None published.</p>
            ) : (
              <pre className="max-h-96 overflow-auto rounded-xl bg-black/40 p-2.5 font-mono text-[11px] leading-relaxed text-zinc-300">
                {JSON.stringify(report.structuredData, null, 2)}
              </pre>
            )}
          </Section>

          <Section id="page-stats" title="Document stats" icon={Code2}>
            <Row label="Scripts" value={report.stats.scriptCount} />
            <Row label="Inline script bytes" value={formatBytes(report.stats.inlineScriptBytes)} />
            <Row label="Images" value={report.stats.imageCount} />
            <Row label="Links" value={report.stats.linkCount} />
            <Row label="Iframes" value={report.stats.iframeCount} />
            <Row label="Forms" value={report.stats.formCount} />
            <Row label="Visible text" value={`${report.stats.textLength} chars`} />
            <Row label="Content type" value={report.contentType ?? "unknown"} mono />
            <Row label="Resolved to" value={report.addresses.join(", ")} mono />
          </Section>

          <Section id="notes" title="What this report cannot show" icon={Info} defaultOpen>
            <ul className="space-y-1.5">
              {report.notes.map((note) => (
                <li key={note} className="flex gap-2 text-[12px] leading-relaxed text-zinc-400">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                  {note}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}
