export type MutationStamp = {
  updatedAt: string;
  mutationId: string;
};

export type DeletionStamp = {
  deletedAt: string;
  mutationId: string;
};

export type TodoItem = {
  id: string;
  referenceId: string;
  text: string;
  durationMinutes?: number;
  completed: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  mutationId: string;
  sortOrder: number;
  sourceDate: string;
  copiedFromDate?: string;
  threadId?: string;
  threadTaskId?: string;
};

export type ThreadTaskItem = {
  id: string;
  referenceId: string;
  text: string;
  durationMinutes?: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  mutationId: string;
  sortOrder: number;
};

export type ThreadRecord = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  mutationId: string;
  sortOrder: number;
  tasks: ThreadTaskItem[];
};

export type NoteDocument = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  mutationId: string;
};

export type ThemeMode = "dark" | "light" | "system";

export type CopyToBehavior = "reference" | "value";

export type TodoaySyncMetadata = {
  schemaVersion: 3;
  todoTombstones: Record<string, DeletionStamp>;
  noteTombstones: Record<string, DeletionStamp>;
  noteLinkMetadata: Record<string, Record<string, MutationStamp>>;
  noteLinkTombstones: Record<string, Record<string, DeletionStamp>>;
  threadTombstones: Record<string, DeletionStamp>;
  threadTaskTombstones: Record<string, DeletionStamp>;
  settings: {
    themeMode: MutationStamp;
    copyToBehavior: MutationStamp;
  };
};

export type TodoayState = {
  todosByDate: Record<string, TodoItem[]>;
  noteIdsByDate: Record<string, string[]>;
  noteDocs: Record<string, NoteDocument>;
  threads: ThreadRecord[];
  themeMode: ThemeMode;
  copyToBehavior: CopyToBehavior;
  syncMetadata: TodoaySyncMetadata;
};

export type TodoayExportData = {
  version: 1 | 2 | 3;
  exportedAt: string;
  tasks: Record<string, TodoItem[]>;
  noteIdsByDate: Record<string, string[]>;
  noteDocs: Record<string, NoteDocument>;
  threads?: ThreadRecord[];
  syncMetadata?: TodoaySyncMetadata;
};

export type TodoConflict = {
  kind: "todo";
  key: string;
  date: string;
  existing: TodoItem;
  incoming: TodoItem;
};

export type NoteConflict = {
  kind: "note";
  key: string;
  existing: NoteDocument;
  incoming: NoteDocument;
  dates: string[];
};

export type ImportConflict = TodoConflict | NoteConflict;

export type ImportConflictResolution = "existing" | "incoming" | "both";

export type SyncUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
};

export type SyncStatus = {
  available: boolean;
  configured: boolean;
  online: boolean;
  authReady: boolean;
  isAuthenticated: boolean;
  isSyncing: boolean;
  pendingChanges: boolean;
  lastLocalChangeAt: string | null;
  lastSyncedAt: string | null;
  lastSyncAttemptAt: string | null;
  error: string | null;
  user: SyncUser | null;
};
