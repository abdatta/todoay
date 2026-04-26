"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Settings, MoonStar, Copy, Download, Upload, FileWarning, Cloud, LogOut } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";
import { formatSyncedText } from "@/lib/syncPresentation";
import type {
  ImportConflict,
  ImportConflictResolution,
  TodoayExportData,
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
    (candidate.version === 1 || candidate.version === 2) &&
    typeof candidate.exportedAt === "string" &&
    typeof candidate.tasks === "object" &&
    candidate.tasks !== null &&
    typeof candidate.noteIdsByDate === "object" &&
    candidate.noteIdsByDate !== null &&
    typeof candidate.noteDocs === "object" &&
    candidate.noteDocs !== null &&
    Array.isArray(candidate.undatedEntries)
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
    state,
  } = useTodoay();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error">("success");
  const [pendingImport, setPendingImport] = useState<TodoayExportData | null>(null);
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, ImportConflictResolution>>({});
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
    return `${taskCount} task${taskCount === 1 ? "" : "s"} and ${noteCount} note${noteCount === 1 ? "" : "s"}`;
  }, [pendingImport]);

  const syncInlineLabel = useMemo(() => {
    const accountLabel = syncStatus.user?.email ?? syncStatus.user?.name ?? "Local only";
    return `${accountLabel} · ${formatSyncedText(syncStatus.lastSyncedAt)}`;
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
    setStatusMessage("Exported your tasks and notes as JSON.");
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
    setStatusMessage("Imported data and merged it into your existing tasks and notes.");
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
              <Download size={18} color="var(--accent-color)" />
              <span>Export tasks and notes</span>
            </span>
            <span className="settings-row-description">
              Download everything as a JSON backup you can re-import later.
            </span>
          </span>
          <button
            type="button"
            className="settings-icon-action"
            onClick={handleExport}
            aria-label="Export tasks and notes as JSON"
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
              Upload a Todoay export file to merge its tasks and notes with what you already have.
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
              aria-label="Import tasks and notes from JSON"
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
