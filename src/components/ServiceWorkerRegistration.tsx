"use client";

import { useEffect } from "react";

type ServiceWorkerRegistrationProps = {
  basePath: string;
};

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

const isEditing = () => {
  const element = document.activeElement;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
};

export default function ServiceWorkerRegistration({ basePath }: ServiceWorkerRegistrationProps) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const container = navigator.serviceWorker;

    // The dev server has no static export to precache, so keep it worker-free.
    if (process.env.NODE_ENV !== "production") {
      container.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((error: unknown) => {
          console.error("Service worker cleanup failed", error);
        });
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;
    let controlled = Boolean(container.controller);
    let reloadPending = false;
    let hasReloaded = false;
    let lastUpdateCheckAt = Date.now();
    let disposed = false;

    const reload = () => {
      if (hasReloaded) {
        return;
      }
      hasReloaded = true;
      window.location.reload();
    };

    // A downloaded update is only switched on while the app is in the
    // background, so it never interrupts what is on screen.
    const activateWaitingWorker = () => {
      if (document.visibilityState === "hidden") {
        registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
      }
    };

    const handleControllerChange = () => {
      if (!controlled) {
        // First install claiming this page: nothing to refresh.
        controlled = true;
        return;
      }

      // State is persisted on every change, so reloading is safe for data;
      // only hold back while the user is typing.
      if (document.visibilityState === "hidden" || !isEditing()) {
        reload();
      } else {
        reloadPending = true;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (reloadPending) {
          reload();
          return;
        }
        activateWaitingWorker();
        return;
      }

      if (registration && Date.now() - lastUpdateCheckAt > UPDATE_CHECK_INTERVAL_MS) {
        lastUpdateCheckAt = Date.now();
        registration.update().catch(() => {
          // Offline or flaky network: try again on a later visit.
        });
      }
    };

    const watchWorker = (worker: ServiceWorker | null) => {
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && container.controller) {
          activateWaitingWorker();
        }
      });
    };

    const register = () => {
      if (disposed) {
        return;
      }

      container
        .register(`${basePath}/sw.js`, { updateViaCache: "none" })
        .then((nextRegistration) => {
          registration = nextRegistration;
          watchWorker(nextRegistration.installing);
          nextRegistration.addEventListener("updatefound", () => {
            watchWorker(nextRegistration.installing);
          });
          activateWaitingWorker();
        })
        .catch((error: unknown) => {
          console.error("Service worker registration failed", error);
        });
    };

    container.addEventListener("controllerchange", handleControllerChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Register after load so precaching never competes with first paint.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      disposed = true;
      container.removeEventListener("controllerchange", handleControllerChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("load", register);
    };
  }, [basePath]);

  return null;
}
