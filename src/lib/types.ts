export type TodoItem = {
  id: string;
  referenceId: string;
  text: string;
  completed: boolean;
  pinned: boolean;
  createdAt: string;
  sourceDate: string;
  copiedFromDate?: string;
};

export type NoteDocument = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UndatedChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
};

export type UndatedEntry = {
  id: string;
  type: "list" | "note";
  title: string;
  text: string;
  items: UndatedChecklistItem[];
};

export type ThemeMode = "dark" | "light" | "system";

export type CopyToBehavior = "reference" | "value";

export type TodoayState = {
  todosByDate: Record<string, TodoItem[]>;
  noteIdsByDate: Record<string, string[]>;
  noteDocs: Record<string, NoteDocument>;
  undatedEntries: UndatedEntry[];
  themeMode: ThemeMode;
  copyToBehavior: CopyToBehavior;
};

export type TodoayExportData = {
  version: 1;
  exportedAt: string;
  tasks: Record<string, TodoItem[]>;
  noteIdsByDate: Record<string, string[]>;
  noteDocs: Record<string, NoteDocument>;
  undatedEntries: UndatedEntry[];
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
