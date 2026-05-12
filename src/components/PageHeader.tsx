"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CircleAlert, RefreshCcw } from "lucide-react";
import { useTodoay } from "@/lib/store";
import { formatSyncedText } from "@/lib/syncPresentation";

const STUCK_SYNC_MS = 12000;
const UNSYNCED_INDICATOR_DELAY_MS = 2000;
const STATUS_REFRESH_MS = 500;

export default function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: ReactNode;
  subtitle?: string;
  icon: ReactNode;
  actions?: ReactNode;
}) {
  const { syncStatus, syncNow } = useTodoay();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, STATUS_REFRESH_MS);

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
    const elapsedSinceLocalChange = syncStatus.lastLocalChangeAt
      ? now - new Date(syncStatus.lastLocalChangeAt).getTime()
      : Number.POSITIVE_INFINITY;
    const canSyncToAccount = syncStatus.isAuthenticated;
    const showUnsyncedIndicator =
      elapsedSinceLocalChange >= UNSYNCED_INDICATOR_DELAY_MS;
    const needsAttention = Boolean(
      syncStatus.error ||
      (canSyncToAccount &&
        (syncStatus.isSyncing || syncStatus.pendingChanges) &&
        showUnsyncedIndicator &&
        elapsedSinceAttempt > STUCK_SYNC_MS),
    );
    const isBusy = syncStatus.isSyncing && !needsAttention;
    const isAvailable = syncStatus.isAuthenticated && syncStatus.online;
    const hasUnsyncedChanges =
      canSyncToAccount && syncStatus.pendingChanges && showUnsyncedIndicator && !needsAttention;
    const titleText = syncStatus.error
      ? syncStatus.error
      : !syncStatus.isAuthenticated
        ? "Sign in with Google in Settings to sync."
        : !syncStatus.online
          ? "You're offline. Sync will resume when you're back online."
          : syncStatus.pendingChanges
            ? syncStatus.isSyncing
              ? "Syncing unsaved changes..."
              : "Unsynced changes. Click to sync now."
          : `${formatSyncedText(syncStatus.lastSyncedAt)}. Click to sync now.`;

    return (
      <button
        type="button"
        className={`btn-icon header-sync-button${isBusy ? " syncing" : ""}${needsAttention ? " attention" : ""}${hasUnsyncedChanges ? " pending" : ""}`}
        onClick={() => void syncNow()}
        aria-label={needsAttention ? "Sync needs attention" : syncStatus.pendingChanges ? "Unsynced changes" : "Sync now"}
        title={titleText}
        disabled={isBusy || !isAvailable}
      >
        {needsAttention ? <AlertTriangle size={18} /> : <RefreshCcw size={18} />}
        {hasUnsyncedChanges ? (
          <span className="header-sync-pending-badge" aria-hidden="true">
            <CircleAlert size={12} strokeWidth={2.4} />
          </span>
        ) : null}
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
