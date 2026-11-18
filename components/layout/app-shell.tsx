"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { History, ScanLine, Settings, Sparkles } from "lucide-react";
import { Logo, Wordmark } from "@/components/ui/logo";
import { cn, initials } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const nav = [
  { href: "/inspect", label: "Inspector", icon: ScanLine },
  { href: "/dashboard", label: "History", icon: History },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      {/* ---------------- sidebar ---------------- */}
      <aside className="sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.015] backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Logo size={28} />
            <Wordmark />
          </Link>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
                  active
                    ? "text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl border border-white/10 bg-gradient-to-r from-indigo-500/20 via-violet-500/10 to-transparent"
                  />
                )}
                <item.icon
                  className={cn(
                    "relative z-10 h-4 w-4 transition-colors",
                    active ? "text-indigo-300" : "text-zinc-500 group-hover:text-zinc-300",
                  )}
                />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-3">
          <div className="glass-subtle rounded-2xl p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-300">
              <Sparkles className="h-3 w-3" />
              {profile.plan === "free" ? "Free tier" : profile.plan}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
              Unlimited inspections and storage. History never expires.
            </p>
          </div>
        </div>

        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11.5px] font-semibold text-white">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                initials(profile.full_name ?? profile.email)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-white">
                {profile.full_name ?? "Studio member"}
              </p>
              <p className="truncate text-[11px] text-zinc-500">{profile.email}</p>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg px-1.5 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                title="Sign out"
              >
                Exit
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ---------------- content ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#09090b]/70 px-5 backdrop-blur-xl lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Logo size={28} />
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "rounded-lg p-2 transition-colors",
                  pathname === item.href
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-white",
                )}
              >
                <item.icon className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
