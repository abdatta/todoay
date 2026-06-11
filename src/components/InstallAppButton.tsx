"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  platforms: string[];
  userChoice: Promise<BeforeInstallPromptChoice>;
  prompt: () => Promise<void>;
};

type InstallMode = "native" | "ios";

const REVEAL_DELAY_MS = 3000;
const REVEAL_DURATION_MS = 5000;

let hasAnimatedInstallButton = false;

const isRunningAsInstalledApp = () => {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
};

const isIosSafari = () => {
  const ua = window.navigator.userAgent;
  const isIosDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  return isIosDevice && isSafari;
};

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window === "undefined" ? false : isRunningAsInstalledApp(),
  );
  const [isWide, setIsWide] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const revealTimersRef = useRef<number[]>([]);

  useEffect(() => {
    if (isInstalled) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMode("native");
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setMode(null);
      setShowIosHint(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    const iosFallbackTimer = isIosSafari()
      ? window.setTimeout(() => setMode("ios"), 0)
      : undefined;

    return () => {
      window.clearTimeout(iosFallbackTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isInstalled]);

  useEffect(() => {
    if (!mode || hasAnimatedInstallButton) {
      return;
    }

    const expandTimer = window.setTimeout(() => {
      hasAnimatedInstallButton = true;
      setIsWide(true);
    }, REVEAL_DELAY_MS);
    const collapseTimer = window.setTimeout(() => {
      setIsWide(false);
    }, REVEAL_DELAY_MS + REVEAL_DURATION_MS);

    revealTimersRef.current = [expandTimer, collapseTimer];

    return () => {
      revealTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      revealTimersRef.current = [];
    };
  }, [mode]);

  if (isInstalled || !mode) {
    return null;
  }

  const handleInstall = async () => {
    if (mode === "ios") {
      setShowIosHint((current) => !current);
      setIsWide(true);
      return;
    }

    if (!installPrompt) {
      return;
    }

    setShowIosHint(false);
    setIsWide(false);
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setMode(null);
  };

  return (
    <div className="install-header-action">
      <button
        type="button"
        className={`install-header-button ${isWide ? "wide" : ""}`}
        onClick={() => void handleInstall()}
        aria-label="Install Todoay as an app"
        title="Install Todoay as an app"
      >
        <Download size={17} />
        <span className="install-header-label">Install</span>
      </button>
      {showIosHint ? (
        <div className="install-header-popover" role="status">
          Use Share, then Add to Home Screen.
        </div>
      ) : null}
    </div>
  );
}
