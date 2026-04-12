"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export default function ClientReady({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  return <>{children}</>;
}
