"use client";

import { useEffect } from "react";

type ServiceWorkerRegistrationProps = {
  basePath: string;
};

export default function ServiceWorkerRegistration({
  basePath,
}: ServiceWorkerRegistrationProps) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const swUrl = `${basePath}/sw.js`;

    navigator.serviceWorker.register(swUrl).catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  }, [basePath]);

  return null;
}
