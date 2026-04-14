"use client";

import { useEffect } from "react";

type ServiceWorkerRegistrationProps = {
  basePath: string;
  version: string;
};

export default function ServiceWorkerRegistration({
  basePath,
  version,
}: ServiceWorkerRegistrationProps) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const shouldDisableServiceWorker = version === "dev" || isLocalhost;

    if (shouldDisableServiceWorker) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((error: unknown) => {
          console.error("Service worker cleanup failed", error);
        });
      return;
    }

    const swUrl = `${basePath}/sw.js?v=${encodeURIComponent(version)}`;
    let hasRefreshed = false;

    const reloadForUpdate = () => {
      if (hasRefreshed) {
        return;
      }

      hasRefreshed = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdate);

    navigator.serviceWorker
      .register(swUrl, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        console.error("Service worker registration failed", error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", reloadForUpdate);
    };
  }, [basePath, version]);

  return null;
}
