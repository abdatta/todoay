"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useTodoay } from "@/lib/store";
import { formatSyncedText } from "@/lib/syncPresentation";

const STUCK_SYNC_MS = 12000;

export default function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  actions?: ReactNode;
}) {
  const { syncStatus, syncNow } = useTodoay();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const syncButton = useMemo(() => {
    if (!syncStatus.configured) {
      return null;
    }

    const elapsedSinceAttempt = syncStatus.lastSyncAttemptAt
      ? now - new Date(syncStatus.lastSyncAttemptAt).getTime()
      : 0;
    const needsAttention = Boolean(
      syncStatus.error ||
      ((syncStatus.isSyncing || syncStatus.pendingChanges) && elapsedSinceAttempt > STUCK_SYNC_MS),
    );
    const isBusy = syncStatus.isSyncing && !needsAttention;
    const isAvailable = syncStatus.isAuthenticated && syncStatus.online;
    const titleText = syncStatus.error
      ? syncStatus.error
      : !syncStatus.isAuthenticated
        ? "Sign in with Google in Settings to sync."
        : !syncStatus.online
          ? "You're offline. Sync will resume when you're back online."
          : `${formatSyncedText(syncStatus.lastSyncedAt)}. Click to sync now.`;

    return (
      <button
        type="button"
        className={`btn-icon header-sync-button${isBusy ? " syncing" : ""}${needsAttention ? " attention" : ""}`}
        onClick={() => void syncNow()}
        aria-label={needsAttention ? "Sync needs attention" : "Sync now"}
        title={titleText}
        disabled={isBusy || !isAvailable}
      >
        {needsAttention ? <AlertTriangle size={18} /> : <RefreshCcw size={18} />}
      </button>
    );
  }, [now, syncNow, syncStatus]);

  return (
    <header className="page-header">
      <div className="page-header-top">
        <div>
          <div className="page-title-group">
            {icon}
            <h1 className="page-title">{title}</h1>
          </div>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
        {syncButton || actions ? (
          <div className="header-actions">
            {syncButton}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
