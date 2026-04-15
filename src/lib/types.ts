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
