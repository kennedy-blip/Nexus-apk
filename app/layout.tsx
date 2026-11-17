import type { Metadata, Viewport } from "next";
import { AmbientBackground } from "@/components/ui/background";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NexusAPK Studio — Stream Android apps in your browser",
    template: "%s · NexusAPK Studio",
  },
  description:
    "Upload an APK and run it instantly in a cloud Android device. WebRTC streaming, real touch input, zero installs.",
  applicationName: "NexusAPK Studio",
  keywords: ["APK", "Android emulator", "cloud phone", "WebRTC", "redroid", "app testing"],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "NexusAPK Studio",
    description: "Cloud-native Android playground for your APKs.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Fonts are loaded at runtime rather than through next/font/google so the
 * production build never depends on reaching fonts.googleapis.com. If the
 * network is unavailable the CSS stack falls back to the system UI face.
 */
const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_STYLESHEET} />
      </head>
      <body className="min-h-dvh antialiased selection:bg-indigo-500/30">
        <AmbientBackground />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
