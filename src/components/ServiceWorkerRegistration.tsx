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
