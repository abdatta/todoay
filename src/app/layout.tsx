import type { Metadata, Viewport } from "next";
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
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#111110",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TodoayProvider>
          <ServiceWorkerRegistration basePath={process.env.PAGES_BASE_PATH || ""} />
          <Navigation />
          <main className="container">{children}</main>
        </TodoayProvider>
      </body>
    </html>
  );
}
