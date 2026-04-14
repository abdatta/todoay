import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { TodoayProvider } from "@/lib/store";
import Navigation from "@/components/Navigation";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Todoay",
  description: "A local-first app for tasks, notes, misc lists, and lightweight settings.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Todoay",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
        >{`(() => {
  try {
    const raw = window.localStorage.getItem("todoay-state-v1");
    const parsed = raw ? JSON.parse(raw) : null;
    const themeMode = parsed?.themeMode ?? "system";
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
})();`}</Script>
        <TodoayProvider>
          <ServiceWorkerRegistration
            basePath={process.env.PAGES_BASE_PATH || ""}
            version={process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
          />
          <Navigation />
          <main className="container">{children}</main>
        </TodoayProvider>
      </body>
    </html>
  );
}
