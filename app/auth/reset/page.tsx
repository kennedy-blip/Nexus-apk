import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your NexusScope account.",
};

/**
 * Landing page for the Supabase recovery link. The link's `code` is exchanged
 * by /auth/callback, which redirects here with a valid session cookie, so this
 * screen can call `updateUser` directly.
 */
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="text-[15px] font-semibold text-white">
            Nexus<span className="text-gradient">APK</span>
          </span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <ResetPasswordForm />
      </main>
    </div>
  );
}
