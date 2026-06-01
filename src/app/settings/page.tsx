"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Settings, MoonStar, Copy, Download, Upload, FileWarning, Cloud, LogOut, History, RotateCcw, X } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";
import { formatSyncedText } from "@/lib/syncPresentation";
import type {
  ImportConflict,
  ImportConflictResolution,
  TodoaySnapshotCommit,
  TodoayExportData,
  TodoayState,
  ThemeMode,
} from "@/lib/types";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const isTodoayExportData = (value: unknown): value is TodoayExportData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TodoayExportData>;
  return (
    (candidate.version === 1 || candidate.version === 2 || candidate.version === 3) &&
    typeof candidate.exportedAt === "string" &&
    typeof candidate.tasks === "object" &&
    candidate.tasks !== null &&
    typeof candidate.noteIdsByDate === "object" &&
    candidate.noteIdsByDate !== null &&
    typeof candidate.noteDocs === "object" &&
    candidate.noteDocs !== null &&
    (candidate.threads === undefined || Array.isArray(candidate.threads))
  );
};

const describeConflictChoice = (choice: ImportConflictResolution) => {
  if (choice === "incoming") {
    return "Use imported";
  }
  if (choice === "both") {
    return "Keep both";
  }
  return "Keep existing";
};

const formatHistoryTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

const describeCommitSource = (commit: TodoaySnapshotCommit) => {
  const label = commit.source.label || "Unknown source";
  if (commit.source.kind === "device") {
    return label;
  }
  return `${label} (${commit.source.kind})`;
};

const pluralize = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;

const flattenTodoMap = (snapshot: TodoayState) =>
  new Map(
    Object.values(snapshot.todosByDate)
      .flat()
      .map((todo) => [todo.id, JSON.stringify(todo)]),
  );

const threadSummaryMap = (snapshot: TodoayState) =>
  new Map(
    snapshot.threads.map((thread) => [
      thread.id,
      JSON.stringify({
        title: thread.title,
        pinned: thread.pinned,
        archived: thread.archived,
        sortOrder: thread.sortOrder,
      }),
    ]),
  );

const noteSummaryMap = (snapshot: TodoayState) =>
  new Map(Object.entries(snapshot.noteDocs).map(([noteId, note]) => [noteId, JSON.stringify(note)]));

const countChangedItems = (current: Map<string, string>, previous: Map<string, string>) => {
  let changed = 0;

  current.forEach((value, key) => {
    if (previous.get(key) !== value) {
      changed += 1;
    }
  });

  previous.forEach((_, key) => {
    if (!current.has(key)) {
      changed += 1;
    }
  });

  return changed;
};

const describeHistoryChange = (
  commit: TodoaySnapshotCommit,
  previousCommit: TodoaySnapshotCommit | undefined,
) => {
  if (commit.reason === "restore") {
    return "Restored an earlier version";
  }

  if (!previousCommit) {
    return "Saved cloud backup";
  }

  const taskChanges = countChangedItems(flattenTodoMap(commit.state), flattenTodoMap(previousCommit.state));
  const noteChanges = countChangedItems(noteSummaryMap(commit.state), noteSummaryMap(previousCommit.state));
  const threadChanges = countChangedItems(threadSummaryMap(commit.state), threadSummaryMap(previousCommit.state));
  const changes = [
    taskChanges > 0 ? pluralize(taskChanges, "task") : null,
    noteChanges > 0 ? pluralize(noteChanges, "note") : null,
    threadChanges > 0 ? pluralize(threadChanges, "thread") : null,
  ].filter((change): change is string => Boolean(change));

  if (changes.length > 0) {
    return `Changed ${changes.join(", ")}`;
  }

  if (
    commit.state.themeMode !== previousCommit.state.themeMode ||
    commit.state.copyToBehavior !== previousCommit.state.copyToBehavior
  ) {
    return "Updated settings";
  }

  return "Synced latest changes";
};

function SettingsScreen() {
  const {
    ready,
    setThemeMode,
    setCopyToBehavior,
    exportData,
    getImportConflicts,
    importData,
    syncStatus,
    signInWithGoogle,
    signOut,
    listSnapshotCommits,
    restoreSnapshotCommit,
    state,
  } = useTodoay();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error">("success");
  const [pendingImport, setPendingImport] = useState<TodoayExportData | null>(null);
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, ImportConflictResolution>>({});
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyCommits, setHistoryCommits] = useState<TodoaySnapshotCommit[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [restoringCommitId, setRestoringCommitId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const resolvedConflicts = useMemo(
    () => conflicts.filter((conflict) => resolutions[conflict.key]),
    [conflicts, resolutions],
  );

  const pendingSummary = useMemo(() => {
    if (!pendingImport) {
      return null;
    }

    const taskCount = Object.values(pendingImport.tasks).reduce((sum, items) => sum + items.length, 0);
    const noteCount = Object.keys(pendingImport.noteDocs).length;
    const threadCount = pendingImport.threads?.length ?? 0;
    return `${taskCount} task${taskCount === 1 ? "" : "s"}, ${noteCount} note${noteCount === 1 ? "" : "s"}, and ${threadCount} thread${threadCount === 1 ? "" : "s"}`;
  }, [pendingImport]);

  const syncInlineLabel = useMemo(() => {
    const accountLabel = syncStatus.user?.email ?? syncStatus.user?.name ?? "Local only";
    return `${accountLabel} - ${formatSyncedText(syncStatus.lastSyncedAt)}`;
  }, [syncStatus]);

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  const selectedTheme = THEME_OPTIONS.find((option) => option.value === state.themeMode) ?? THEME_OPTIONS[0];

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `todoay-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
    setStatusTone("success");
    setStatusMessage("Exported your tasks, notes, and threads as JSON.");
  };

  const resetImportState = () => {
    setPendingImport(null);
    setConflicts([]);
    setResolutions({});
  };

  const finalizeImport = (
    data: TodoayExportData,
    nextResolutions: Record<string, ImportConflictResolution> = {},
  ) => {
    importData(data, nextResolutions);
    resetImportState();
    setStatusTone("success");
    setStatusMessage("Imported data and merged it into your existing tasks, notes, and threads.");
  };

  const refreshHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      setHistoryCommits(await listSnapshotCommits());
    } catch (error) {
      console.error("Failed to load Todoay history", error);
      setHistoryError(error instanceof Error ? error.message : "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = () => {
    setIsHistoryOpen(true);
    void refreshHistory();
  };

  const restoreHistoryCommit = async (commit: TodoaySnapshotCommit) => {
    const commitTime = formatHistoryTime(commit.createdAt);
    const confirmed = window.confirm(
      `Restore Todoay to the version from ${commitTime}? This will create a new history entry for the restore.`,
    );

    if (!confirmed) {
      return;
    }

    setRestoringCommitId(commit.id);
    setHistoryError(null);

    try {
      await restoreSnapshotCommit(commit.id);
      setStatusTone("success");
      setStatusMessage(`Restored Todoay to the version from ${commitTime}.`);
      await refreshHistory();
    } catch (error) {
      console.error("Failed to restore Todoay history", error);
      setHistoryError(error instanceof Error ? error.message : "Failed to restore this revision.");
    } finally {
      setRestoringCommitId(null);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const parsed: unknown = JSON.parse(raw);

      if (!isTodoayExportData(parsed)) {
        throw new Error("That file does not look like a Todoay export.");
      }

      const nextConflicts = getImportConflicts(parsed);
      if (nextConflicts.length === 0) {
        finalizeImport(parsed);
        return;
      }

      setPendingImport(parsed);
      setConflicts(nextConflicts);
      setResolutions(
        Object.fromEntries(nextConflicts.map((conflict) => [conflict.key, "existing" satisfies ImportConflictResolution])),
      );
      setStatusTone("success");
      setStatusMessage(`Found ${nextConflicts.length} merge conflict${nextConflicts.length === 1 ? "" : "s"}. Choose how to merge them below.`);
    } catch (error) {
      console.error("Failed to import Todoay export", error);
      resetImportState();
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Failed to read the import file.");
    }
  };

  return (
    <div className="app-shell">
      <PageHeader
        title="Settings"
        icon={<Settings size={30} color="var(--accent-color)" />}
      />

      <section className="card settings-card">
        <label className="settings-row">
          <span className="settings-row-text">
            <span className="settings-row-label">
              <MoonStar size={18} color="var(--accent-color)" />
              <span>Dark Mode</span>
            </span>
          </span>
          <div className="settings-select-shell" ref={menuRef}>
            <button
              type="button"
              className={`settings-select ${isMenuOpen ? "open" : ""}`}
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-label="Dark mode preference"
              aria-haspopup="listbox"
              aria-expanded={isMenuOpen}
            >
              {selectedTheme.label}
            </button>

            {isMenuOpen ? (
              <div className="settings-menu" role="listbox" aria-label="Dark mode options">
                {THEME_OPTIONS.map((option) => {
                  const isSelected = option.value === state.themeMode;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`settings-menu-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setThemeMode(option.value as ThemeMode);
                        setIsMenuOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </label>

        <div className="settings-divider" />

        <label className="settings-row" htmlFor="copy-to-behavior-toggle">
          <span className="settings-row-text">
            <span className="settings-row-label">
              <Copy size={18} color="var(--accent-color)" />
              <span>&quot;Copy To&quot; will create linked copies</span>
            </span>
            <span className="settings-row-description">
              When this is on, &quot;Copy To&quot; will create linked copies, meaning, if you tick/untick one of them, the other one will updates too. Turn it off to make each copy separate.
            </span>
          </span>
          <button
            id="copy-to-behavior-toggle"
            type="button"
            role="switch"
            aria-checked={state.copyToBehavior === "reference"}
            aria-label="Copy To keeps copies linked"
            className={`settings-switch ${state.copyToBehavior === "reference" ? "on" : ""}`}
            onClick={() =>
              setCopyToBehavior(state.copyToBehavior === "reference" ? "value" : "reference")
            }
          >
            <span className="settings-switch-track">
              <span className="settings-switch-thumb" />
            </span>
          </button>
        </label>

        <div className="settings-divider" />

        <div className="settings-row settings-row-sync">
          <span className="settings-row-text settings-sync-copy">
            <span className="settings-row-label">
              <Cloud size={18} color="var(--accent-color)" />
              <span>Google sync</span>
            </span>
            <span className="settings-row-description settings-sync-inline-status">
              {syncInlineLabel}
            </span>
          </span>
          <div className="settings-sync-actions">
            {syncStatus.isAuthenticated ? (
              <button
                type="button"
                className="settings-icon-action"
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="primary-button settings-sync-button"
                onClick={() => void signInWithGoogle()}
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-row settings-row-stack">
          <span className="settings-row-text">
            <span className="settings-row-label">
              <History size={18} color="var(--accent-color)" />
              <span>Cloud history</span>
            </span>
            <span className="settings-row-description">
              Review recent synced revisions and restore a previous state for this account.
            </span>
          </span>
          <button
            type="button"
            className="settings-icon-action"
            onClick={openHistory}
            disabled={!syncStatus.isAuthenticated}
            aria-label="Open cloud history"
            title={syncStatus.isAuthenticated ? "Open cloud history" : "Sign in to view history"}
          >
            <History size={18} />
          </button>
        </div>

        <div className="settings-divider" />

        <div className="settings-row settings-row-stack">
          <span className="settings-row-text">
            <span className="settings-row-label">
              <Download size={18} color="var(--accent-color)" />
              <span>Export tasks, notes, and threads</span>
            </span>
            <span className="settings-row-description">
              Download everything as a JSON backup you can re-import later.
            </span>
          </span>
          <button
            type="button"
            className="settings-icon-action"
            onClick={handleExport}
              aria-label="Export tasks, notes, and threads as JSON"
            title="Export JSON"
          >
            <Download size={18} />
          </button>
        </div>

        <div className="settings-divider" />

        <div className="settings-row settings-row-stack">
          <span className="settings-row-text">
            <span className="settings-row-label">
              <Upload size={18} color="var(--accent-color)" />
              <span>Import and merge</span>
            </span>
            <span className="settings-row-description">
              Upload a Todoay export file to merge its tasks, notes, and threads with what you already have.
            </span>
          </span>
          <div className="settings-import-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="settings-file-input"
              onChange={handleImportFile}
            />
            <button
              type="button"
              className="settings-icon-action"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Import tasks, notes, and threads from JSON"
              title="Import JSON"
            >
              <Upload size={18} />
            </button>
          </div>
        </div>

        {statusMessage ? (
          <>
            <div className="settings-divider" />
            <div className={`settings-status ${statusTone === "error" ? "error" : "success"}`}>
              {statusMessage}
            </div>
          </>
        ) : null}
      </section>

      {pendingImport && conflicts.length > 0 ? (
        <div
          className="settings-modal-overlay"
          role="presentation"
          onClick={() => {
            resetImportState();
            setStatusTone("error");
            setStatusMessage("Import canceled.");
          }}
        >
          <section
            className="settings-modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="merge-conflicts-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header">
              <div className="settings-modal-title-group">
                <FileWarning size={20} color="var(--accent-color)" />
                <div>
                  <h2 id="merge-conflicts-title" className="settings-modal-title">Resolve Merge Conflicts</h2>
                  <p className="settings-row-description">
                    Importing {pendingSummary}. Choose what to keep for each conflict.
                  </p>
                </div>
              </div>
            </div>

            <div className="settings-conflict-list">
              {conflicts.map((conflict) => (
                <article key={conflict.key} className="settings-conflict-card">
                  <div className="settings-conflict-topline">
                    <span className="pill">
                      {conflict.kind === "todo" ? `Task on ${conflict.date}` : "Note"}
                    </span>
                    <span className="settings-conflict-choice">
                      {describeConflictChoice(resolutions[conflict.key] ?? "existing")}
                    </span>
                  </div>

                  <div className="settings-conflict-columns">
                    <div className="settings-conflict-column">
                      <div className="settings-conflict-column-label">Existing</div>
                      {conflict.kind === "todo" ? (
                        <p className="settings-conflict-body">{conflict.existing.text || "Untitled task"}</p>
                      ) : (
                        <>
                          <p className="settings-conflict-title">{conflict.existing.title || "Untitled note"}</p>
                          <p className="settings-conflict-body">{conflict.existing.content || "Empty note"}</p>
                        </>
                      )}
                    </div>

                    <div className="settings-conflict-column">
                      <div className="settings-conflict-column-label">Imported</div>
                      {conflict.kind === "todo" ? (
                        <p className="settings-conflict-body">{conflict.incoming.text || "Untitled task"}</p>
                      ) : (
                        <>
                          <p className="settings-conflict-title">{conflict.incoming.title || "Untitled note"}</p>
                          <p className="settings-conflict-body">{conflict.incoming.content || "Empty note"}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {conflict.kind === "note" && conflict.dates.length > 0 ? (
                    <p className="settings-conflict-meta">
                      Used on {conflict.dates.join(", ")}
                    </p>
                  ) : null}

                  <div className="settings-conflict-actions">
                    {(["existing", "incoming", "both"] as ImportConflictResolution[]).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        className={`segmented-button ${resolutions[conflict.key] === choice ? "active" : ""}`}
                        onClick={() =>
                          setResolutions((current) => ({ ...current, [conflict.key]: choice }))
                        }
                      >
                        {describeConflictChoice(choice)}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="settings-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  resetImportState();
                  setStatusTone("error");
                  setStatusMessage("Import canceled.");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => pendingImport && finalizeImport(pendingImport, resolutions)}
              >
                Merge {resolvedConflicts.length === conflicts.length ? "Now" : "With Defaults"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isHistoryOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="settings-modal-overlay"
          role="presentation"
          onClick={() => setIsHistoryOpen(false)}
        >
          <section
            className="settings-modal card settings-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-modal-header settings-modal-header-spread">
              <div className="settings-modal-title-group">
                <History size={20} color="var(--accent-color)" />
                <div>
                  <h2 id="cloud-history-title" className="settings-modal-title">Cloud History</h2>
                  <p className="settings-row-description">
                    Recent account revisions are kept for rollback and audit.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="settings-modal-close-button"
                onClick={() => setIsHistoryOpen(false)}
                aria-label="Close cloud history"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {historyError ? (
              <div className="settings-status error">{historyError}</div>
            ) : null}

            <div className="settings-history-list">
              {historyLoading ? (
                <div className="settings-history-empty">Loading history...</div>
              ) : historyCommits.length === 0 ? (
                <div className="settings-history-empty">
                  No cloud history yet. Make a synced change and it will appear here.
                </div>
              ) : (
                historyCommits.map((commit, index) => (
                  <article key={commit.id} className="settings-history-row">
                    <div className="settings-history-main">
                      <div className="settings-history-title">
                        <span>{formatHistoryTime(commit.createdAt)}</span>
                      </div>
                      <div className="settings-history-meta">
                        {describeCommitSource(commit)} - {describeHistoryChange(commit, historyCommits[index + 1])}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="settings-icon-action"
                      onClick={() => void restoreHistoryCommit(commit)}
                      disabled={Boolean(restoringCommitId)}
                      aria-label={`Restore version from ${formatHistoryTime(commit.createdAt)}`}
                      title={`Restore version from ${formatHistoryTime(commit.createdAt)}`}
                    >
                      <RotateCcw size={18} />
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ClientReady>
      <SettingsScreen />
    </ClientReady>
  );
}
