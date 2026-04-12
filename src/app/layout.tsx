import type { Metadata } from "next";
import "./globals.css";
import { TodoayProvider } from "@/lib/store";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Todoay",
  description: "A local-first app for tasks, notes, misc lists, and lightweight settings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TodoayProvider>
          <Navigation />
          <main className="container">{children}</main>
        </TodoayProvider>
      </body>
    </html>
  );
}
