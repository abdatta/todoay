"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { getOAuthRedirectUrl, getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  createInitialState,
  createMutationStamp,
  getNextTodoSortOrder,
  mergeTodoayStates,
  normalizeState,
  serializeState,
} from "@/lib/sync";
import { applyThemeChrome } from "@/lib/theme";
import type {
  CopyToBehavior,
  ImportConflict,
  ImportConflictResolution,
  MutationStamp,
  NoteDocument,
  SyncStatus,
  SyncUser,
  ThreadRecord,
  ThreadTaskItem,
  TodoItem,
  TodoayExportData,
  TodoayState,
  ThemeMode,
} from "@/lib/types";

const STORAGE_KEY = "todoay-state-v2";
const LEGACY_STORAGE_KEY = "todoay-state-v1";
const LOCAL_SYNC_META_KEY = "todoay-local-sync-v1";
const SNAPSHOT_TABLE = "todoay_snapshots";
const SYNC_DEBOUNCE_MS = 500;
const SYNC_TIMEOUT_MS = 12000;

type LocalSyncMeta = {
  clientId: string;
  mutationCounter: number;
  pendingSync: boolean;
  lastLocalChangeAt: string | null;
  lastSyncedAt: string | null;
  lastRemoteRevision: number;
  onboardedAccountIds: Record<string, true>;
};

type SnapshotRecord = {
  state: TodoayState;
  revision: number;
  updated_at: string;
};

type SnapshotQueryResult = {
  data: SnapshotRecord | null;
  error: { message: string } | null;
};

type SnapshotUpsertResult = {
  data: Pick<SnapshotRecord, "revision" | "updated_at"> | null;
  error: { message: string } | null;
};

type SignOutPromptState = {
  isOpen: boolean;
};

type SignInConflictPromptState = {
  remoteState: TodoayState;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getThreadReorderLane = (thread: ThreadRecord) => {
  if (thread.archived) {
    return "archived";
  }
  if (thread.pinned) {
    return "pinned";
  }
  return thread.tasks.length === 0 ? "inactive" : "active";
};

const createLocalSyncMeta = (): LocalSyncMeta => ({
  clientId: createId(),
  mutationCounter: 0,
  pendingSync: false,
  lastLocalChangeAt: null,
  lastSyncedAt: null,
  lastRemoteRevision: 0,
  onboardedAccountIds: {},
});

const getStateContentCount = (state: TodoayState) => {
  const taskCount = Object.values(state.todosByDate).reduce((sum, items) => sum + items.length, 0);
  const noteCount = Object.keys(state.noteDocs).length;
  const threadCount = state.threads.length;
  return taskCount + noteCount + threadCount;
};

const hasAnyStoredContent = (state: TodoayState) => getStateContentCount(state) > 0;

const clearStoredContent = (state: TodoayState) =>
  normalizeState({
    ...createInitialState(),
    themeMode: state.themeMode,
    copyToBehavior: state.copyToBehavior,
    syncMetadata: {
      ...createInitialState().syncMetadata,
      settings: state.syncMetadata.settings,
    },
  });

const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, message: string) => {
  let timeoutId: number | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise as Promise<T>]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
};

const toSyncUser = (session: Session | null): SyncUser | null => {
  const user = session?.user;
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null,
    avatarUrl:
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : null,
  };
};

const isSameTodo = (left: TodoItem, right: TodoItem) =>
  left.id === right.id &&
  left.referenceId === right.referenceId &&
  left.text === right.text &&
  left.durationMinutes === right.durationMinutes &&
  left.completed === right.completed &&
  left.pinned === right.pinned &&
  left.createdAt === right.createdAt &&
  left.sourceDate === right.sourceDate &&
  left.copiedFromDate === right.copiedFromDate &&
  left.threadId === right.threadId &&
  left.threadTaskId === right.threadTaskId;

const isSameNote = (left: NoteDocument, right: NoteDocument) =>
  left.id === right.id &&
  left.title === right.title &&
  left.content === right.content &&
  left.pinned === right.pinned &&
  left.createdAt === right.createdAt;

const cloneTodoForImport = (
  todo: TodoItem,
  nextDate: string,
  stamp: MutationStamp,
  sortOrder: number,
): TodoItem => ({
  ...todo,
  id: createId(),
  referenceId: createId(),
  sourceDate: nextDate,
  createdAt: stamp.updatedAt,
  updatedAt: stamp.updatedAt,
  mutationId: stamp.mutationId,
  sortOrder,
});

const cloneNoteForImport = (note: NoteDocument, stamp: MutationStamp): NoteDocument => ({
  ...note,
  id: createId(),
  createdAt: stamp.updatedAt,
  updatedAt: stamp.updatedAt,
  mutationId: stamp.mutationId,
});

const buildImportConflicts = (current: TodoayState, incoming: TodoayExportData): ImportConflict[] => {
  const normalizedCurrent = normalizeState(current);
  const normalizedIncoming = normalizeState({
    todosByDate: incoming.tasks,
    noteIdsByDate: incoming.noteIdsByDate,
    noteDocs: incoming.noteDocs,
    threads: incoming.threads ?? [],
    syncMetadata: incoming.syncMetadata,
  });
  const conflicts: ImportConflict[] = [];

  Object.entries(normalizedIncoming.todosByDate).forEach(([date, items]) => {
    const localItems = normalizedCurrent.todosByDate[date] ?? [];
    items.forEach((incomingTodo) => {
      const existing = localItems.find((item) => item.id === incomingTodo.id);
      if (existing && !isSameTodo(existing, incomingTodo)) {
        conflicts.push({
          kind: "todo",
          key: `todo:${date}:${incomingTodo.id}`,
          date,
          existing,
          incoming: incomingTodo,
        });
      }
    });
  });

  Object.entries(normalizedIncoming.noteDocs).forEach(([noteId, incomingNote]) => {
    const existing = normalizedCurrent.noteDocs[noteId];
    if (!existing || isSameNote(existing, incomingNote)) {
      return;
    }

    const dates = Object.entries(normalizedIncoming.noteIdsByDate)
      .filter(([, ids]) => ids.includes(noteId))
      .map(([date]) => date);

    conflicts.push({
      kind: "note",
      key: `note:${noteId}`,
      existing,
      incoming: incomingNote,
      dates,
    });
  });

  return conflicts;
};

const applyImportToState = (
  current: TodoayState,
  incoming: TodoayExportData,
  resolutions: Record<string, ImportConflictResolution>,
  stamp: MutationStamp,
) => {
  const next = normalizeState(current);
  const normalizedIncoming = normalizeState({
    todosByDate: incoming.tasks,
    noteIdsByDate: incoming.noteIdsByDate,
    noteDocs: incoming.noteDocs,
    threads: incoming.threads ?? [],
    syncMetadata: incoming.syncMetadata,
  });

  const todoDates = new Set([
    ...Object.keys(next.todosByDate),
    ...Object.keys(normalizedIncoming.todosByDate),
  ]);

  todoDates.forEach((date) => {
    const localItems = [...(next.todosByDate[date] ?? [])];
    const incomingItems = normalizedIncoming.todosByDate[date] ?? [];

    incomingItems.forEach((incomingTodo) => {
      if (localItems.some((item) => isSameTodo(item, incomingTodo))) {
        return;
      }

      const conflictIndex = localItems.findIndex((item) => item.id === incomingTodo.id);
      if (conflictIndex === -1) {
        localItems.push({
          ...incomingTodo,
          sortOrder: getNextTodoSortOrder(localItems),
        });
        return;
      }

      const resolution = resolutions[`todo:${date}:${incomingTodo.id}`] ?? "existing";
      if (resolution === "incoming") {
        localItems[conflictIndex] = {
          ...incomingTodo,
          sortOrder: localItems[conflictIndex].sortOrder,
        };
      } else if (resolution === "both") {
        localItems.push(
          cloneTodoForImport(incomingTodo, date, stamp, getNextTodoSortOrder(localItems)),
        );
      }
    });

    next.todosByDate[date] = localItems;
  });

  const allIncomingNoteIds = new Set(Object.keys(normalizedIncoming.noteDocs));

  Object.entries(normalizedIncoming.noteDocs).forEach(([noteId, incomingDoc]) => {
    const localDoc = next.noteDocs[noteId];
    if (!localDoc) {
      next.noteDocs[noteId] = incomingDoc;
      return;
    }

    if (isSameNote(localDoc, incomingDoc)) {
      return;
    }

    const resolution = resolutions[`note:${noteId}`] ?? "existing";
    if (resolution === "incoming") {
      next.noteDocs[noteId] = incomingDoc;
      return;
    }

    if (resolution === "both") {
      const clonedNote = cloneNoteForImport(incomingDoc, stamp);
      next.noteDocs[clonedNote.id] = clonedNote;

      Object.entries(normalizedIncoming.noteIdsByDate).forEach(([date, ids]) => {
        if (!ids.includes(noteId)) {
          return;
        }
        next.noteIdsByDate[date] = [...(next.noteIdsByDate[date] ?? []), clonedNote.id];
        next.syncMetadata.noteLinkMetadata[date] = {
          ...(next.syncMetadata.noteLinkMetadata[date] ?? {}),
          [clonedNote.id]: createMutationStamp(stamp.updatedAt, stamp.mutationId),
        };
      });
    }
  });

  Object.entries(normalizedIncoming.noteIdsByDate).forEach(([date, ids]) => {
    ids.forEach((noteId) => {
      if (!allIncomingNoteIds.has(noteId) || !next.noteDocs[noteId]) {
        return;
      }

      if ((next.noteIdsByDate[date] ?? []).includes(noteId)) {
        return;
      }

      next.noteIdsByDate[date] = [...(next.noteIdsByDate[date] ?? []), noteId];
      next.syncMetadata.noteLinkMetadata[date] = {
        ...(next.syncMetadata.noteLinkMetadata[date] ?? {}),
        [noteId]:
          normalizedIncoming.syncMetadata.noteLinkMetadata[date]?.[noteId] ??
          createMutationStamp(stamp.updatedAt, stamp.mutationId),
      };
    });
  });

  const existingThreadIds = new Set(next.threads.map((thread) => thread.id));
  normalizedIncoming.threads.forEach((thread) => {
    if (existingThreadIds.has(thread.id)) {
      return;
    }

    next.threads.push(thread);
    existingThreadIds.add(thread.id);
  });

  return normalizeState(next);
};

type StoreValue = {
  ready: boolean;
  state: TodoayState;
  resolvedTheme: Exclude<ThemeMode, "system">;
  syncStatus: SyncStatus;
  setThemeMode: (themeMode: ThemeMode) => void;
  setCopyToBehavior: (copyToBehavior: CopyToBehavior) => void;
  exportData: () => TodoayExportData;
  getImportConflicts: (incoming: TodoayExportData) => ImportConflict[];
  importData: (
    incoming: TodoayExportData,
    resolutions?: Record<string, ImportConflictResolution>,
  ) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  addTodo: (date: string) => string;
  updateTodo: (date: string, todoId: string, patch: Partial<TodoItem>) => void;
  deleteTodo: (date: string, todoId: string) => void;
  reorderTodo: (date: string, todoId: string, targetTodoId: string, placement: "before" | "after") => void;
  copyTodoToDate: (fromDate: string, todoId: string, toDate: string) => void;
  copyTodoReferenceToDate: (fromDate: string, todoId: string, toDate: string) => void;
  moveTodoReferenceToDate: (fromDate: string, todoId: string, toDate: string) => void;
  addThread: (title?: string) => string;
  updateThread: (threadId: string, patch: Partial<ThreadRecord>) => void;
  deleteThread: (threadId: string) => void;
  reorderThread: (threadId: string, targetThreadId: string, placement: "before" | "after") => void;
  addThreadTask: (threadId: string) => string;
  updateThreadTask: (threadId: string, taskId: string, patch: Partial<ThreadTaskItem>) => void;
  deleteThreadTask: (threadId: string, taskId: string) => void;
  reorderThreadTask: (threadId: string, taskId: string, targetTaskId: string, placement: "before" | "after") => void;
  scheduleThreadTaskToDate: (threadId: string, taskId: string, toDate: string) => void;
  addNote: (date: string) => string;
  updateNoteDoc: (noteId: string, patch: Partial<NoteDocument>) => void;
  removeNoteFromDate: (date: string, noteId: string) => void;
  carryNoteToDate: (fromDate: string, noteId: string, toDate: string) => void;
  getVisibleTodos: (date: string, today: string) => TodoItem[];
  getVisibleNoteIds: (date: string, today: string) => string[];
  getDatesForNote: (noteId: string) => string[];
};

const TodoayContext = createContext<StoreValue | null>(null);

export function TodoayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TodoayState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [systemTheme, setSystemTheme] = useState<Exclude<ThemeMode, "system">>("dark");
  const [localSyncMeta, setLocalSyncMeta] = useState<LocalSyncMeta>(createLocalSyncMeta);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured());
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAttemptAt, setLastSyncAttemptAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [signOutPrompt, setSignOutPrompt] = useState<SignOutPromptState>({ isOpen: false });
  const [signInConflictPrompt, setSignInConflictPrompt] = useState<SignInConflictPromptState | null>(null);
  const [authConflictCheckInProgress, setAuthConflictCheckInProgress] = useState(false);

  const stateRef = useRef(state);
  const localSyncMetaRef = useRef(localSyncMeta);
  const sessionRef = useRef(session);
  const onlineRef = useRef(online);
  const syncTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const isSigningOutRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    localSyncMetaRef.current = localSyncMeta;
  }, [localSyncMeta]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const updateLocalSyncMeta = useCallback((updater: (current: LocalSyncMeta) => LocalSyncMeta) => {
    setLocalSyncMeta((current) => {
      const next = updater(current);
      localSyncMetaRef.current = next;
      return next;
    });
  }, []);

  const cancelScheduledSync = useCallback(() => {
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, []);

  const markAccountOnboarded = useCallback((userId: string) => {
    updateLocalSyncMeta((current) => ({
      ...current,
      onboardedAccountIds: {
        ...current.onboardedAccountIds,
        [userId]: true,
      },
    }));
  }, [updateLocalSyncMeta]);

  const fetchRemoteSnapshot = useCallback(async (userId: string) => {
    const client = getSupabaseClient();
    if (!client) {
      return null;
    }

    const { data, error } = await withTimeout<SnapshotQueryResult>(
      client
        .from(SNAPSHOT_TABLE)
        .select("state, revision, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      SYNC_TIMEOUT_MS,
      "Sync is taking longer than expected. Tap the sync icon to retry.",
    );

    if (error) {
      throw error;
    }

    return data
      ? {
          ...data,
          state: normalizeState(data.state),
        }
      : null;
  }, []);

  const takeMutationStamp = useCallback(() => {
    const current = localSyncMetaRef.current;
    const nextCounter = current.mutationCounter + 1;
    const updatedAt = new Date().toISOString();
    const stamp = createMutationStamp(updatedAt, `${current.clientId}:${nextCounter}`);

    updateLocalSyncMeta((meta) => ({
      ...meta,
      mutationCounter: nextCounter,
      pendingSync: true,
      lastLocalChangeAt: updatedAt,
    }));

    return stamp;
  }, [updateLocalSyncMeta]);

  const applyLocalMutation = useCallback(
    (recipe: (current: TodoayState, stamp: MutationStamp) => TodoayState) => {
      const stamp = takeMutationStamp();
      setState((current) => normalizeState(recipe(current, stamp)));
    },
    [takeMutationStamp],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        setState(normalizeState(JSON.parse(raw) as TodoayState));
      }
    } catch (error) {
      console.error("Failed to load Todoay state", error);
    }

    try {
      const rawSyncMeta = window.localStorage.getItem(LOCAL_SYNC_META_KEY);
      if (rawSyncMeta) {
        const parsed = JSON.parse(rawSyncMeta) as Partial<LocalSyncMeta>;
        setLocalSyncMeta({
          ...createLocalSyncMeta(),
          ...parsed,
          clientId: parsed.clientId ?? createId(),
          mutationCounter: typeof parsed.mutationCounter === "number" ? parsed.mutationCounter : 0,
          lastRemoteRevision:
            typeof parsed.lastRemoteRevision === "number" ? parsed.lastRemoteRevision : 0,
          onboardedAccountIds:
            parsed.onboardedAccountIds && typeof parsed.onboardedAccountIds === "object"
              ? parsed.onboardedAccountIds as Record<string, true>
              : {},
        });
      }
    } catch (error) {
      console.error("Failed to load Todoay sync metadata", error);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    applySystemTheme();
    mediaQuery.addEventListener("change", applySystemTheme);

    return () => {
      mediaQuery.removeEventListener("change", applySystemTheme);
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    window.localStorage.setItem(LOCAL_SYNC_META_KEY, JSON.stringify(localSyncMeta));
  }, [localSyncMeta, ready]);

  useEffect(() => {
    const syncOnlineState = () => {
      setOnline(window.navigator.onLine);
    };

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);

    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  const performSync = useCallback(async () => {
    const client = getSupabaseClient();
    const currentSession = sessionRef.current;

    if (!ready || !client || !currentSession?.user || !onlineRef.current || syncInFlightRef.current) {
      return;
    }

    syncInFlightRef.current = true;
    const startedAt = new Date().toISOString();
    setIsSyncing(true);
    setLastSyncAttemptAt(startedAt);
    setSyncError(null);

    try {
      const remoteSnapshot = await fetchRemoteSnapshot(currentSession.user.id);

      const localState = normalizeState(stateRef.current);
      const remoteState = remoteSnapshot?.state ?? createInitialState();
      const mergedState = mergeTodoayStates(localState, remoteState);
      const localSerialized = serializeState(localState);
      const remoteSerialized = serializeState(remoteState);
      const mergedSerialized = serializeState(mergedState);

      if (mergedSerialized !== localSerialized) {
        stateRef.current = mergedState;
        setState(mergedState);
      }

      const shouldPush =
        !remoteSnapshot ||
        mergedSerialized !== remoteSerialized ||
        localSyncMetaRef.current.pendingSync;

      if (shouldPush) {
        const revision = Number(remoteSnapshot?.revision ?? 0) + 1;
        const syncedAt = new Date().toISOString();
        const { data: upsertedSnapshot, error: upsertError } = await withTimeout<SnapshotUpsertResult>(
          client
            .from(SNAPSHOT_TABLE)
            .upsert(
              {
                user_id: currentSession.user.id,
                state: mergedState,
                revision,
                updated_at: syncedAt,
              },
              { onConflict: "user_id" },
            )
            .select("revision, updated_at")
            .single(),
          SYNC_TIMEOUT_MS,
          "Sync is taking longer than expected. Tap the sync icon to retry.",
        );

        if (upsertError) {
          throw upsertError;
        }

        updateLocalSyncMeta((current) => ({
          ...current,
          pendingSync:
            current.lastLocalChangeAt !== null && current.lastLocalChangeAt > startedAt,
          lastSyncedAt: upsertedSnapshot?.updated_at ?? syncedAt,
          lastRemoteRevision: Number(upsertedSnapshot?.revision ?? revision),
        }));
      } else {
        updateLocalSyncMeta((current) => ({
          ...current,
          pendingSync:
            current.lastLocalChangeAt !== null && current.lastLocalChangeAt > startedAt,
          lastSyncedAt: remoteSnapshot?.updated_at ?? localSyncMetaRef.current.lastSyncedAt ?? startedAt,
          lastRemoteRevision: Number(remoteSnapshot?.revision ?? current.lastRemoteRevision),
        }));
      }
    } catch (error) {
      if (
        isSigningOutRef.current ||
        !sessionRef.current?.user ||
        sessionRef.current.user.id !== currentSession.user.id
      ) {
        return;
      }
      console.error("Todoay sync failed", error);
      setSyncError(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  }, [fetchRemoteSnapshot, ready, updateLocalSyncMeta]);

  const scheduleSync = useCallback(
    (delay = SYNC_DEBOUNCE_MS) => {
      cancelScheduledSync();

      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        void performSync();
      }, delay);
    },
    [cancelScheduledSync, performSync],
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      return;
    }

    let active = true;

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }

      if (error) {
        setSyncError(error.message);
      }

      setSession(data.session ?? null);
      setAuthReady(true);
    });

    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);

      if (event === "SIGNED_OUT") {
        isSigningOutRef.current = false;
        cancelScheduledSync();
        syncInFlightRef.current = false;
        setIsSyncing(false);
        setAuthConflictCheckInProgress(false);
        setSignInConflictPrompt(null);
        setSyncError(null);
      }

      if (nextSession?.user) {
        isSigningOutRef.current = false;
        setAuthConflictCheckInProgress(true);
        window.setTimeout(() => {
          void (async () => {
            try {
              const remoteSnapshot = await fetchRemoteSnapshot(nextSession.user.id);
              const remoteState = remoteSnapshot?.state ?? createInitialState();
              const localState = normalizeState(stateRef.current);
              const localHasContent = hasAnyStoredContent(localState);
              const remoteHasContent = hasAnyStoredContent(remoteState);
              const hasSeenThisAccountOnThisDevice = Boolean(
                localSyncMetaRef.current.onboardedAccountIds[nextSession.user.id],
              );

              if (!hasSeenThisAccountOnThisDevice && localHasContent && remoteHasContent) {
                setSignInConflictPrompt({
                  remoteState,
                });
                return;
              }

              markAccountOnboarded(nextSession.user.id);
              setSignInConflictPrompt(null);
              setAuthConflictCheckInProgress(false);
              scheduleSync(150);
            } catch (error) {
              setAuthConflictCheckInProgress(false);
              setSyncError(error instanceof Error ? error.message : "Sync failed.");
            }
          })();
        }, 0);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [cancelScheduledSync, fetchRemoteSnapshot, markAccountOnboarded, scheduleSync]);

  useEffect(() => {
    if (
      !ready ||
      !isSupabaseConfigured() ||
      !authReady ||
      !session?.user ||
      !online ||
      authConflictCheckInProgress ||
      Boolean(signInConflictPrompt)
    ) {
      return;
    }
    scheduleSync(150);
  }, [authConflictCheckInProgress, authReady, online, ready, scheduleSync, session, signInConflictPrompt]);

  useEffect(() => {
    if (
      !ready ||
      !localSyncMeta.pendingSync ||
      !session?.user ||
      !online ||
      isSyncing ||
      authConflictCheckInProgress ||
      Boolean(signInConflictPrompt)
    ) {
      return;
    }
    scheduleSync();
  }, [
    authConflictCheckInProgress,
    isSyncing,
    localSyncMeta.lastLocalChangeAt,
    localSyncMeta.pendingSync,
    online,
    ready,
    scheduleSync,
    session,
    signInConflictPrompt,
  ]);

  useEffect(() => {
    const client = getSupabaseClient();

    if (realtimeChannelRef.current) {
      void realtimeChannelRef.current.unsubscribe();
      client?.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    if (!ready || !client || !authReady || !session?.user || authConflictCheckInProgress || signInConflictPrompt) {
      return;
    }

    const channel = client
      .channel(`todoay-snapshot:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SNAPSHOT_TABLE,
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const remoteState = payload.new && typeof payload.new === "object" && "state" in payload.new
            ? (payload.new.state as TodoayState | undefined)
            : undefined;

          if (remoteState) {
            const mergedState = mergeTodoayStates(stateRef.current, normalizeState(remoteState));
            const mergedSerialized = serializeState(mergedState);
            const currentSerialized = serializeState(stateRef.current);

            if (mergedSerialized !== currentSerialized) {
              stateRef.current = mergedState;
              setState(mergedState);
            }
          }

          scheduleSync(50);
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current === channel) {
        void channel.unsubscribe();
        client.removeChannel(channel);
        realtimeChannelRef.current = null;
      }
    };
  }, [authConflictCheckInProgress, authReady, ready, scheduleSync, session, signInConflictPrompt]);

  useEffect(() => {
    if (!ready || !session?.user || authConflictCheckInProgress || signInConflictPrompt) {
      return;
    }

    const refreshFromVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleSync(100);
      }
    };

    const refreshFromFocus = () => {
      scheduleSync(100);
    };

    document.addEventListener("visibilitychange", refreshFromVisibility);
    window.addEventListener("focus", refreshFromFocus);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        scheduleSync(100);
      }
    }, 15000);

    return () => {
      document.removeEventListener("visibilitychange", refreshFromVisibility);
      window.removeEventListener("focus", refreshFromFocus);
      window.clearInterval(intervalId);
    };
  }, [authConflictCheckInProgress, ready, scheduleSync, session, signInConflictPrompt]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
      if (realtimeChannelRef.current) {
        void realtimeChannelRef.current.unsubscribe();
      }
    };
  }, []);

  const resolvedTheme = state.themeMode === "system" ? systemTheme : state.themeMode;

  useEffect(() => {
    applyThemeChrome(resolvedTheme);
  }, [resolvedTheme]);

  const syncStatus = useMemo<SyncStatus>(() => ({
    available: isSupabaseConfigured(),
    configured: isSupabaseConfigured(),
    online,
    authReady,
    isAuthenticated: Boolean(session?.user),
    isSyncing,
    pendingChanges: localSyncMeta.pendingSync,
    lastLocalChangeAt: localSyncMeta.lastLocalChangeAt,
    lastSyncedAt: localSyncMeta.lastSyncedAt,
    lastSyncAttemptAt,
    error: syncError,
    user: toSyncUser(session),
  }), [authReady, isSyncing, lastSyncAttemptAt, localSyncMeta.lastLocalChangeAt, localSyncMeta.lastSyncedAt, localSyncMeta.pendingSync, online, session, syncError]);

  const completeSignOut = useCallback(async (clearDevice: boolean) => {
    const client = getSupabaseClient();
    if (!client) {
      setSignOutPrompt({ isOpen: false });
      return;
    }

    isSigningOutRef.current = true;
    cancelScheduledSync();
    syncInFlightRef.current = false;
    setIsSyncing(false);
    setSyncError(null);
    setSignOutPrompt({ isOpen: false });
    setSignInConflictPrompt(null);
    setAuthConflictCheckInProgress(false);

    if (clearDevice) {
      setState((current) => clearStoredContent(current));
      updateLocalSyncMeta((current) => ({
        ...current,
        pendingSync: false,
        lastLocalChangeAt: null,
      }));
    }

    if (realtimeChannelRef.current) {
      void realtimeChannelRef.current.unsubscribe();
      client.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const { error } = await client.auth.signOut();
    if (error) {
      isSigningOutRef.current = false;
      setSyncError(error.message);
    }
  }, [cancelScheduledSync, updateLocalSyncMeta]);

  const resolveSignInConflict = useCallback((mode: "merge" | "replace") => {
    const userId = sessionRef.current?.user?.id;

    if (!signInConflictPrompt || !userId) {
      setAuthConflictCheckInProgress(false);
      return;
    }

    if (mode === "replace") {
      const nextState = normalizeState(signInConflictPrompt.remoteState);
      stateRef.current = nextState;
      setState(nextState);
      updateLocalSyncMeta((current) => ({
        ...current,
        pendingSync: false,
        lastLocalChangeAt: null,
      }));
    }

    markAccountOnboarded(userId);
    setSignInConflictPrompt(null);
    setAuthConflictCheckInProgress(false);
    scheduleSync(100);
  }, [markAccountOnboarded, scheduleSync, signInConflictPrompt, updateLocalSyncMeta]);

  const value = useMemo<StoreValue>(() => ({
    ready,
    state,
    resolvedTheme,
    syncStatus,
    setThemeMode(themeMode) {
      applyLocalMutation((current, stamp) => ({
        ...current,
        themeMode,
        syncMetadata: {
          ...current.syncMetadata,
          settings: {
            ...current.syncMetadata.settings,
            themeMode: stamp,
          },
        },
      }));
    },
    setCopyToBehavior(copyToBehavior) {
      applyLocalMutation((current, stamp) => ({
        ...current,
        copyToBehavior,
        syncMetadata: {
          ...current.syncMetadata,
          settings: {
            ...current.syncMetadata.settings,
            copyToBehavior: stamp,
          },
        },
      }));
    },
    exportData() {
      return {
        version: 3,
        exportedAt: new Date().toISOString(),
        tasks: state.todosByDate,
        noteIdsByDate: state.noteIdsByDate,
        noteDocs: state.noteDocs,
        threads: state.threads,
        syncMetadata: state.syncMetadata,
      };
    },
    getImportConflicts(incoming) {
      return buildImportConflicts(state, incoming);
    },
    importData(incoming, resolutions = {}) {
      const stamp = takeMutationStamp();
      setState((current) => applyImportToState(current, incoming, resolutions, stamp));
    },
    async signInWithGoogle() {
      const client = getSupabaseClient();
      if (!client) {
        setSyncError("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sync.");
        return;
      }

      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getOAuthRedirectUrl(),
        },
      });

      if (error) {
        setSyncError(error.message);
      }
    },
    async signOut() {
      setSignOutPrompt({ isOpen: true });
    },
    async syncNow() {
      await performSync();
    },
    addTodo(date) {
      const todoId = createId();
      applyLocalMutation((current, stamp) => {
        const nextTodo: TodoItem = {
          id: todoId,
          referenceId: createId(),
          text: "",
          durationMinutes: undefined,
          completed: false,
          pinned: false,
          createdAt: stamp.updatedAt,
          updatedAt: stamp.updatedAt,
          mutationId: stamp.mutationId,
          sortOrder: getNextTodoSortOrder(current.todosByDate[date] ?? []),
          sourceDate: date,
        };

        return {
          ...current,
          todosByDate: {
            ...current.todosByDate,
            [date]: [...(current.todosByDate[date] ?? []), nextTodo],
          },
          syncMetadata: {
            ...current.syncMetadata,
            todoTombstones: Object.fromEntries(
              Object.entries(current.syncMetadata.todoTombstones).filter(([key]) => key !== todoId),
            ),
          },
        };
      });

      return todoId;
    },
    updateTodo(date, todoId, patch) {
      applyLocalMutation((current, stamp) => {
        const sourceTodo = (current.todosByDate[date] ?? []).find((todo) => todo.id === todoId);
        if (!sourceTodo) {
          return current;
        }

        const sharedPatch = {
          text: patch.text,
          durationMinutes: patch.durationMinutes,
          completed: patch.completed,
          pinned: patch.pinned,
        };

        return {
          ...current,
          todosByDate: Object.fromEntries(
            Object.entries(current.todosByDate).map(([todoDate, items]) => [
              todoDate,
              items.map((todo) =>
                todo.referenceId === sourceTodo.referenceId
                  ? {
                      ...todo,
                      ...Object.fromEntries(
                        Object.entries(sharedPatch).filter(
                          ([key, value]) =>
                            value !== undefined ||
                            (key === "durationMinutes" && "durationMinutes" in patch),
                        ),
                      ),
                      updatedAt: stamp.updatedAt,
                      mutationId: stamp.mutationId,
                    }
                  : todo.id === todoId && todoDate === date
                    ? {
                        ...todo,
                        ...patch,
                        updatedAt: stamp.updatedAt,
                        mutationId: stamp.mutationId,
                      }
                    : todo,
              ),
            ]),
          ),
          threads: current.threads.map((thread) => ({
            ...thread,
            tasks: thread.tasks.map((task) =>
              task.referenceId === sourceTodo.referenceId
                ? {
                    ...task,
                    ...Object.fromEntries(
                      Object.entries(sharedPatch).filter(
                        ([key, value]) =>
                          value !== undefined ||
                          (key === "durationMinutes" && "durationMinutes" in patch),
                      ),
                    ),
                    updatedAt: stamp.updatedAt,
                    mutationId: stamp.mutationId,
                  }
                : task,
            ),
            updatedAt: thread.tasks.some((task) => task.referenceId === sourceTodo.referenceId)
              ? stamp.updatedAt
              : thread.updatedAt,
            mutationId: thread.tasks.some((task) => task.referenceId === sourceTodo.referenceId)
              ? stamp.mutationId
              : thread.mutationId,
          })),
        };
      });
    },
    deleteTodo(date, todoId) {
      applyLocalMutation((current, stamp) => ({
        ...current,
        todosByDate: {
          ...current.todosByDate,
          [date]: (current.todosByDate[date] ?? []).filter((todo) => todo.id !== todoId),
        },
        syncMetadata: {
          ...current.syncMetadata,
          todoTombstones: {
            ...current.syncMetadata.todoTombstones,
            [todoId]: {
              deletedAt: stamp.updatedAt,
              mutationId: stamp.mutationId,
            },
          },
        },
      }));
    },
    reorderTodo(date, todoId, targetTodoId, placement) {
      applyLocalMutation((current, stamp) => {
        const items = current.todosByDate[date] ?? [];
        const sourceTodo = items.find((todo) => todo.id === todoId);
        const targetTodo = items.find((todo) => todo.id === targetTodoId);

        if (!sourceTodo || !targetTodo || sourceTodo.id === targetTodo.id || sourceTodo.completed !== targetTodo.completed) {
          return current;
        }

        const group = items.filter((todo) => todo.completed === sourceTodo.completed);
        const movingIndex = group.findIndex((todo) => todo.id === todoId);
        const rawTargetIndex = group.findIndex((todo) => todo.id === targetTodoId);

        if (movingIndex === -1 || rawTargetIndex === -1) {
          return current;
        }

        const nextGroup = [...group];
        const [movingTodo] = nextGroup.splice(movingIndex, 1);
        let targetIndex = rawTargetIndex;

        if (movingIndex < rawTargetIndex) {
          targetIndex -= 1;
        }

        if (placement === "after") {
          targetIndex += 1;
        }

        nextGroup.splice(targetIndex, 0, movingTodo);

        const resequencedGroup = nextGroup.map((todo, index) => ({
          ...todo,
          sortOrder: (index + 1) * 1024,
          updatedAt: stamp.updatedAt,
          mutationId: stamp.mutationId,
        }));

        const nextOpen = sourceTodo.completed ? items.filter((todo) => !todo.completed) : resequencedGroup;
        const nextCompleted = sourceTodo.completed ? resequencedGroup : items.filter((todo) => todo.completed);

        return {
          ...current,
          todosByDate: {
            ...current.todosByDate,
            [date]: [...nextOpen, ...nextCompleted],
          },
        };
      });
    },
    copyTodoToDate(fromDate, todoId, toDate) {
      applyLocalMutation((current, stamp) => {
        const sourceTodo = (current.todosByDate[fromDate] ?? []).find((todo) => todo.id === todoId);
        if (!sourceTodo) {
          return current;
        }

        const duplicateExists = (current.todosByDate[toDate] ?? []).some(
          (todo) => todo.copiedFromDate === fromDate && todo.text === sourceTodo.text,
        );

        if (duplicateExists) {
          return current;
        }

        const nextTodo: TodoItem = {
          ...sourceTodo,
          id: createId(),
          referenceId: createId(),
          completed: false,
          sourceDate: toDate,
          createdAt: stamp.updatedAt,
          updatedAt: stamp.updatedAt,
          mutationId: stamp.mutationId,
          sortOrder: getNextTodoSortOrder(current.todosByDate[toDate] ?? []),
          copiedFromDate: fromDate,
          threadId: undefined,
          threadTaskId: undefined,
        };

        return {
          ...current,
          todosByDate: {
            ...current.todosByDate,
            [toDate]: [...(current.todosByDate[toDate] ?? []), nextTodo],
          },
        };
      });
    },
    copyTodoReferenceToDate(fromDate, todoId, toDate) {
      applyLocalMutation((current, stamp) => {
        const sourceTodo = (current.todosByDate[fromDate] ?? []).find((todo) => todo.id === todoId);
        if (!sourceTodo) {
          return current;
        }

        const existingReference = (current.todosByDate[toDate] ?? []).some(
          (todo) => todo.referenceId === sourceTodo.referenceId,
        );

        if (existingReference) {
          return current;
        }

        const nextTodo: TodoItem = {
          ...sourceTodo,
          id: createId(),
          sourceDate: toDate,
          updatedAt: stamp.updatedAt,
          mutationId: stamp.mutationId,
          sortOrder: getNextTodoSortOrder(current.todosByDate[toDate] ?? []),
        };

        return {
          ...current,
          todosByDate: {
            ...current.todosByDate,
            [toDate]: [...(current.todosByDate[toDate] ?? []), nextTodo],
          },
        };
      });
    },
    moveTodoReferenceToDate(fromDate, todoId, toDate) {
      applyLocalMutation((current, stamp) => {
        const sourceTodo = (current.todosByDate[fromDate] ?? []).find((todo) => todo.id === todoId);
        if (!sourceTodo || fromDate === toDate) {
          return current;
        }

        const targetTodos = current.todosByDate[toDate] ?? [];
        const existingReference = targetTodos.some((todo) => todo.referenceId === sourceTodo.referenceId);
        const nextFromDateTodos = (current.todosByDate[fromDate] ?? []).filter((todo) => todo.id !== todoId);

        return {
          ...current,
          todosByDate: {
            ...current.todosByDate,
            [fromDate]: nextFromDateTodos,
            [toDate]: existingReference
              ? targetTodos
              : [
                  ...targetTodos,
                  {
                    ...sourceTodo,
                    sourceDate: toDate,
                    updatedAt: stamp.updatedAt,
                    mutationId: stamp.mutationId,
                    sortOrder: getNextTodoSortOrder(targetTodos),
                  },
                ],
          },
          syncMetadata: existingReference
            ? {
                ...current.syncMetadata,
                todoTombstones: {
                  ...current.syncMetadata.todoTombstones,
                  [todoId]: {
                    deletedAt: stamp.updatedAt,
                    mutationId: stamp.mutationId,
                  },
                },
              }
            : current.syncMetadata,
        };
      });
    },
    addThread(title) {
      const threadId = createId();
      applyLocalMutation((current, stamp) => ({
        ...current,
        threads: [
          {
            id: threadId,
            title: title?.trim() || "Untitled thread",
            pinned: false,
            archived: false,
            createdAt: stamp.updatedAt,
            updatedAt: stamp.updatedAt,
            mutationId: stamp.mutationId,
            sortOrder:
              Math.min(
                1024,
                ...current.threads
                  .filter((thread) => !thread.archived && !thread.pinned)
                  .map((thread) => thread.sortOrder),
              ) - 1024,
            tasks: [],
          },
          ...current.threads,
        ],
        syncMetadata: {
          ...current.syncMetadata,
          threadTombstones: Object.fromEntries(
            Object.entries(current.syncMetadata.threadTombstones).filter(([key]) => key !== threadId),
          ),
        },
      }));

      return threadId;
    },
    updateThread(threadId, patch) {
      applyLocalMutation((current, stamp) => ({
        ...current,
        threads: current.threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                ...patch,
                pinned: patch.archived ? false : patch.pinned ?? thread.pinned,
                tasks: patch.tasks ?? thread.tasks,
                updatedAt: stamp.updatedAt,
                mutationId: stamp.mutationId,
              }
            : thread,
        ),
      }));
    },
    reorderThread(threadId, targetThreadId, placement) {
      applyLocalMutation((current, stamp) => {
        const sourceThread = current.threads.find((thread) => thread.id === threadId);
        const targetThread = current.threads.find((thread) => thread.id === targetThreadId);
        if (!sourceThread || !targetThread || sourceThread.id === targetThread.id) {
          return current;
        }

        const sourceLane = getThreadReorderLane(sourceThread);
        const inSameLane = sourceLane === getThreadReorderLane(targetThread);
        if (!inSameLane) {
          return current;
        }

        const laneThreads = current.threads
          .filter((thread) => getThreadReorderLane(thread) === sourceLane)
          .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
        const movingIndex = laneThreads.findIndex((thread) => thread.id === threadId);
        const rawTargetIndex = laneThreads.findIndex((thread) => thread.id === targetThreadId);
        if (movingIndex === -1 || rawTargetIndex === -1) {
          return current;
        }

        const nextLane = [...laneThreads];
        const [movingThread] = nextLane.splice(movingIndex, 1);
        let targetIndex = rawTargetIndex;
        if (movingIndex < rawTargetIndex) {
          targetIndex -= 1;
        }
        if (placement === "after") {
          targetIndex += 1;
        }
        nextLane.splice(targetIndex, 0, movingThread);

        const resequenced = new Map(
          nextLane.map((thread, index) => [
            thread.id,
            {
              sortOrder: (index + 1) * 1024,
              updatedAt: stamp.updatedAt,
              mutationId: stamp.mutationId,
            },
          ]),
        );

        return {
          ...current,
          threads: current.threads.map((thread) => {
            const patchForThread = resequenced.get(thread.id);
            return patchForThread ? { ...thread, ...patchForThread } : thread;
          }),
        };
      });
    },
    deleteThread(threadId) {
      applyLocalMutation((current, stamp) => {
        const thread = current.threads.find((candidate) => candidate.id === threadId);
        const relatedTodos = Object.values(current.todosByDate)
          .flat()
          .filter((todo) => todo.threadId === threadId);

        return {
          ...current,
          threads: current.threads.filter((candidate) => candidate.id !== threadId),
          todosByDate: Object.fromEntries(
            Object.entries(current.todosByDate).map(([date, items]) => [
              date,
              items.filter((todo) => todo.threadId !== threadId),
            ]),
          ),
          syncMetadata: {
            ...current.syncMetadata,
            threadTombstones: {
              ...current.syncMetadata.threadTombstones,
              [threadId]: {
                deletedAt: stamp.updatedAt,
                mutationId: stamp.mutationId,
              },
            },
            threadTaskTombstones: {
              ...current.syncMetadata.threadTaskTombstones,
              ...Object.fromEntries(
                (thread?.tasks ?? []).map((task) => [
                  task.id,
                  {
                    deletedAt: stamp.updatedAt,
                    mutationId: stamp.mutationId,
                  },
                ]),
              ),
            },
            todoTombstones: {
              ...current.syncMetadata.todoTombstones,
              ...Object.fromEntries(
                relatedTodos.map((todo) => [
                  todo.id,
                  {
                    deletedAt: stamp.updatedAt,
                    mutationId: stamp.mutationId,
                  },
                ]),
              ),
            },
          },
        };
      });
    },
    addThreadTask(threadId) {
      const taskId = createId();
      applyLocalMutation((current, stamp) => ({
        ...current,
        threads: current.threads.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                updatedAt: stamp.updatedAt,
                mutationId: stamp.mutationId,
                tasks: [
                  ...thread.tasks,
                  {
                    id: taskId,
                    referenceId: createId(),
                    text: "",
                    durationMinutes: undefined,
                    completed: false,
                    createdAt: stamp.updatedAt,
                    updatedAt: stamp.updatedAt,
                    mutationId: stamp.mutationId,
                    sortOrder: (thread.tasks[thread.tasks.length - 1]?.sortOrder ?? 0) + 1024,
                  },
                ],
              }
            : thread,
        ),
        syncMetadata: {
          ...current.syncMetadata,
          threadTaskTombstones: Object.fromEntries(
            Object.entries(current.syncMetadata.threadTaskTombstones).filter(([key]) => key !== taskId),
          ),
        },
      }));

      return taskId;
    },
    updateThreadTask(threadId, taskId, patch) {
      applyLocalMutation((current, stamp) => {
        const thread = current.threads.find((candidate) => candidate.id === threadId);
        const sourceTask = thread?.tasks.find((task) => task.id === taskId);
        if (!sourceTask) {
          return current;
        }

        const sharedPatch = {
          text: patch.text,
          durationMinutes: patch.durationMinutes,
          completed: patch.completed,
        };

        return {
          ...current,
          threads: current.threads.map((candidate) =>
            candidate.id === threadId
              ? {
                  ...candidate,
                  updatedAt: stamp.updatedAt,
                  mutationId: stamp.mutationId,
                  tasks: candidate.tasks.map((task) =>
                    task.id === taskId
                      ? {
                          ...task,
                          ...patch,
                          updatedAt: stamp.updatedAt,
                          mutationId: stamp.mutationId,
                        }
                      : task,
                  ),
                }
              : candidate,
          ),
          todosByDate: Object.fromEntries(
            Object.entries(current.todosByDate).map(([date, items]) => [
              date,
              items.map((todo) =>
                todo.referenceId === sourceTask.referenceId
                  ? {
                      ...todo,
                      ...Object.fromEntries(
                        Object.entries(sharedPatch).filter(
                          ([key, value]) =>
                            value !== undefined ||
                            (key === "durationMinutes" && "durationMinutes" in patch),
                        ),
                      ),
                      updatedAt: stamp.updatedAt,
                      mutationId: stamp.mutationId,
                    }
                  : todo,
              ),
            ]),
          ),
        };
      });
    },
    deleteThreadTask(threadId, taskId) {
      applyLocalMutation((current, stamp) => {
        const thread = current.threads.find((candidate) => candidate.id === threadId);
        const task = thread?.tasks.find((candidate) => candidate.id === taskId);
        const relatedTodos = task
          ? Object.values(current.todosByDate)
              .flat()
              .filter((todo) => todo.referenceId === task.referenceId)
          : [];

        return {
          ...current,
          threads: current.threads.map((candidate) =>
            candidate.id === threadId
              ? {
                  ...candidate,
                  updatedAt: stamp.updatedAt,
                  mutationId: stamp.mutationId,
                  tasks: candidate.tasks.filter((candidateTask) => candidateTask.id !== taskId),
                }
              : candidate,
          ),
          todosByDate: Object.fromEntries(
            Object.entries(current.todosByDate).map(([date, items]) => [
              date,
              task ? items.filter((todo) => todo.referenceId !== task.referenceId) : items,
            ]),
          ),
          syncMetadata: {
            ...current.syncMetadata,
            threadTaskTombstones: {
              ...current.syncMetadata.threadTaskTombstones,
              [taskId]: {
                deletedAt: stamp.updatedAt,
                mutationId: stamp.mutationId,
              },
            },
            todoTombstones: {
              ...current.syncMetadata.todoTombstones,
              ...Object.fromEntries(
                relatedTodos.map((todo) => [
                  todo.id,
                  {
                    deletedAt: stamp.updatedAt,
                    mutationId: stamp.mutationId,
                  },
                ]),
              ),
            },
          },
        };
      });
    },
    reorderThreadTask(threadId, taskId, targetTaskId, placement) {
      applyLocalMutation((current, stamp) => ({
        ...current,
        threads: current.threads.map((thread) => {
          if (thread.id !== threadId) {
            return thread;
          }

          const sourceTask = thread.tasks.find((task) => task.id === taskId);
          const targetTask = thread.tasks.find((task) => task.id === targetTaskId);
          if (!sourceTask || !targetTask || sourceTask.id === targetTask.id || sourceTask.completed !== targetTask.completed) {
            return thread;
          }

          const group = thread.tasks.filter((task) => task.completed === sourceTask.completed);
          const movingIndex = group.findIndex((task) => task.id === taskId);
          const rawTargetIndex = group.findIndex((task) => task.id === targetTaskId);
          if (movingIndex === -1 || rawTargetIndex === -1) {
            return thread;
          }

          const nextGroup = [...group];
          const [movingTask] = nextGroup.splice(movingIndex, 1);
          let targetIndex = rawTargetIndex;
          if (movingIndex < rawTargetIndex) {
            targetIndex -= 1;
          }
          if (placement === "after") {
            targetIndex += 1;
          }
          nextGroup.splice(targetIndex, 0, movingTask);

          const resequencedGroup = nextGroup.map((task, index) => ({
            ...task,
            sortOrder: (index + 1) * 1024,
            updatedAt: stamp.updatedAt,
            mutationId: stamp.mutationId,
          }));
          const nextOpen = sourceTask.completed ? thread.tasks.filter((task) => !task.completed) : resequencedGroup;
          const nextCompleted = sourceTask.completed ? resequencedGroup : thread.tasks.filter((task) => task.completed);

          return {
            ...thread,
            updatedAt: stamp.updatedAt,
            mutationId: stamp.mutationId,
            tasks: [...nextOpen, ...nextCompleted],
          };
        }),
      }));
    },
    scheduleThreadTaskToDate(threadId, taskId, toDate) {
      applyLocalMutation((current, stamp) => {
        const thread = current.threads.find((candidate) => candidate.id === threadId);
        const task = thread?.tasks.find((candidate) => candidate.id === taskId);
        if (!thread || !task) {
          return current;
        }

        const targetTodos = current.todosByDate[toDate] ?? [];
        if (targetTodos.some((todo) => todo.referenceId === task.referenceId)) {
          return current;
        }

        const nextTodo: TodoItem = {
          id: createId(),
          referenceId: task.referenceId,
          text: task.text,
          durationMinutes: task.durationMinutes,
          completed: task.completed,
          pinned: false,
          createdAt: stamp.updatedAt,
          updatedAt: stamp.updatedAt,
          mutationId: stamp.mutationId,
          sortOrder: getNextTodoSortOrder(targetTodos),
          sourceDate: toDate,
          threadId,
          threadTaskId: task.id,
        };

        return {
          ...current,
          todosByDate: {
            ...current.todosByDate,
            [toDate]: [...targetTodos, nextTodo],
          },
        };
      });
    },
    addNote(date) {
      const noteId = createId();
      applyLocalMutation((current, stamp) => {
        const noteDoc: NoteDocument = {
          id: noteId,
          title: "Untitled note",
          content: "",
          pinned: false,
          createdAt: stamp.updatedAt,
          updatedAt: stamp.updatedAt,
          mutationId: stamp.mutationId,
        };

        return {
          ...current,
          noteDocs: {
            ...current.noteDocs,
            [noteId]: noteDoc,
          },
          noteIdsByDate: {
            ...current.noteIdsByDate,
            [date]: [...(current.noteIdsByDate[date] ?? []), noteId],
          },
          syncMetadata: {
            ...current.syncMetadata,
            noteTombstones: Object.fromEntries(
              Object.entries(current.syncMetadata.noteTombstones).filter(([key]) => key !== noteId),
            ),
            noteLinkMetadata: {
              ...current.syncMetadata.noteLinkMetadata,
              [date]: {
                ...(current.syncMetadata.noteLinkMetadata[date] ?? {}),
                [noteId]: stamp,
              },
            },
            noteLinkTombstones: {
              ...current.syncMetadata.noteLinkTombstones,
              [date]: Object.fromEntries(
                Object.entries(current.syncMetadata.noteLinkTombstones[date] ?? {}).filter(
                  ([key]) => key !== noteId,
                ),
              ),
            },
          },
        };
      });

      return noteId;
    },
    updateNoteDoc(noteId, patch) {
      applyLocalMutation((current, stamp) => {
        const existing = current.noteDocs[noteId];
        if (!existing) {
          return current;
        }

        return {
          ...current,
          noteDocs: {
            ...current.noteDocs,
            [noteId]: {
              ...existing,
              ...patch,
              updatedAt: stamp.updatedAt,
              mutationId: stamp.mutationId,
            },
          },
        };
      });
    },
    removeNoteFromDate(date, noteId) {
      applyLocalMutation((current, stamp) => ({
        ...current,
        noteIdsByDate: {
          ...current.noteIdsByDate,
          [date]: (current.noteIdsByDate[date] ?? []).filter((id) => id !== noteId),
        },
        syncMetadata: {
          ...current.syncMetadata,
          noteLinkMetadata: {
            ...current.syncMetadata.noteLinkMetadata,
            [date]: Object.fromEntries(
              Object.entries(current.syncMetadata.noteLinkMetadata[date] ?? {}).filter(
                ([key]) => key !== noteId,
              ),
            ),
          },
          noteLinkTombstones: {
            ...current.syncMetadata.noteLinkTombstones,
            [date]: {
              ...(current.syncMetadata.noteLinkTombstones[date] ?? {}),
              [noteId]: {
                deletedAt: stamp.updatedAt,
                mutationId: stamp.mutationId,
              },
            },
          },
        },
      }));
    },
    carryNoteToDate(fromDate, noteId, toDate) {
      applyLocalMutation((current, stamp) => {
        if (!(current.noteIdsByDate[fromDate] ?? []).includes(noteId)) {
          return current;
        }
        if ((current.noteIdsByDate[toDate] ?? []).includes(noteId)) {
          return current;
        }

        return {
          ...current,
          noteIdsByDate: {
            ...current.noteIdsByDate,
            [toDate]: [...(current.noteIdsByDate[toDate] ?? []), noteId],
          },
          syncMetadata: {
            ...current.syncMetadata,
            noteLinkMetadata: {
              ...current.syncMetadata.noteLinkMetadata,
              [toDate]: {
                ...(current.syncMetadata.noteLinkMetadata[toDate] ?? {}),
                [noteId]: stamp,
              },
            },
            noteLinkTombstones: {
              ...current.syncMetadata.noteLinkTombstones,
              [toDate]: Object.fromEntries(
                Object.entries(current.syncMetadata.noteLinkTombstones[toDate] ?? {}).filter(
                  ([key]) => key !== noteId,
                ),
              ),
            },
          },
        };
      });
    },
    getVisibleTodos(date, today) {
      const direct = state.todosByDate[date] ?? [];
      if (date !== today) {
        return direct;
      }

      const pinnedElsewhere = Object.entries(state.todosByDate)
        .filter(([todoDate]) => todoDate !== today)
        .flatMap(([, items]) => items)
        .filter((todo) => todo.pinned)
        .filter((todo) =>
          !direct.some(
            (existing) =>
              existing.id === todo.id ||
              existing.referenceId === todo.referenceId ||
              existing.text === todo.text,
          ),
        );

      return [...direct, ...pinnedElsewhere];
    },
    getVisibleNoteIds(date, today) {
      const direct = state.noteIdsByDate[date] ?? [];
      if (date !== today) {
        return direct;
      }

      const pinned = Object.values(state.noteDocs)
        .filter((note) => note.pinned)
        .map((note) => note.id)
        .filter((noteId) => !direct.includes(noteId));

      return [...direct, ...pinned];
    },
    getDatesForNote(noteId) {
      return Object.entries(state.noteIdsByDate)
        .filter(([, noteIds]) => noteIds.includes(noteId))
        .map(([date]) => date)
        .sort();
    },
  }), [applyLocalMutation, performSync, ready, resolvedTheme, state, syncStatus, takeMutationStamp]);

  return (
    <TodoayContext.Provider value={value}>
      {children}

      {signOutPrompt.isOpen ? (
        <div className="settings-modal-overlay" role="presentation">
          <section
            className="settings-modal card app-sync-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-out-modal-title"
          >
            <div className="settings-modal-header">
              <div className="settings-modal-title-group">
                <div>
                  <h2 id="sign-out-modal-title" className="settings-modal-title">Sign out of Google sync?</h2>
                  <p className="settings-row-description">
                    Your cloud backup will stay safely saved to this account. If you like, you can also remove the tasks and notes stored on this device after signing out.
                  </p>
                </div>
              </div>
            </div>

            <div className="settings-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setSignOutPrompt({ isOpen: false })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void completeSignOut(false)}
              >
                Sign out only
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void completeSignOut(true)}
              >
                Sign out and clear this device
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {signInConflictPrompt ? (
        <div className="settings-modal-overlay" role="presentation">
          <section
            className="settings-modal card app-sync-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-in-conflict-title"
          >
            <div className="settings-modal-header">
              <div className="settings-modal-title-group">
                <div>
                  <h2 id="sign-in-conflict-title" className="settings-modal-title">Choose how to bring this account back onto this device</h2>
                  <p className="settings-row-description">
                    This account already has Todoay data saved in the cloud, and this device already has its own tasks or notes. You can merge everything together, or replace this device with the cloud backup.
                  </p>
                </div>
              </div>
            </div>

            <div className="settings-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => resolveSignInConflict("replace")}
              >
                Overwrite with cloud backup
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => resolveSignInConflict("merge")}
              >
                Merge both
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </TodoayContext.Provider>
  );
}

export function useTodoay() {
  const context = useContext(TodoayContext);
  if (!context) {
    throw new Error("useTodoay must be used within TodoayProvider");
  }
  return context;
}
