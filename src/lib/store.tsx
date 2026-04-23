"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import type {
  CopyToBehavior,
  ImportConflict,
  ImportConflictResolution,
  NoteDocument,
  TodoItem,
  TodoayExportData,
  TodoayState,
  ThemeMode,
  UndatedChecklistItem,
  UndatedEntry,
} from "@/lib/types";
import { applyThemeChrome } from "@/lib/theme";

const STORAGE_KEY = "todoay-state-v1";

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const createInitialState = (): TodoayState => ({
  todosByDate: {},
  noteIdsByDate: {},
  noteDocs: {},
  undatedEntries: [],
  themeMode: "system",
  copyToBehavior: "reference",
});

const normalizeState = (input?: Partial<TodoayState>): TodoayState => {
  const parsed = { ...createInitialState(), ...(input ?? {}) };
  const todosByDate = Object.fromEntries(
    Object.entries(parsed.todosByDate ?? {}).map(([date, items]) => [
      date,
      (items ?? []).map((todo) => ({
        ...todo,
        referenceId: todo.referenceId ?? todo.id,
      })),
    ]),
  );

  return {
    ...parsed,
    todosByDate,
    noteIdsByDate: parsed.noteIdsByDate ?? {},
    noteDocs: parsed.noteDocs ?? {},
    undatedEntries: parsed.undatedEntries ?? [],
  };
};

const isSameTodo = (left: TodoItem, right: TodoItem) =>
  left.id === right.id &&
  left.referenceId === right.referenceId &&
  left.text === right.text &&
  left.completed === right.completed &&
  left.pinned === right.pinned &&
  left.createdAt === right.createdAt &&
  left.sourceDate === right.sourceDate &&
  left.copiedFromDate === right.copiedFromDate;

const isSameNote = (left: NoteDocument, right: NoteDocument) =>
  left.id === right.id &&
  left.title === right.title &&
  left.content === right.content &&
  left.pinned === right.pinned &&
  left.createdAt === right.createdAt &&
  left.updatedAt === right.updatedAt;

const cloneTodoForImport = (todo: TodoItem, overrideDate?: string): TodoItem => ({
  ...todo,
  id: createId(),
  referenceId: createId(),
  sourceDate: overrideDate ?? todo.sourceDate,
});

const cloneNoteForImport = (note: NoteDocument): NoteDocument => ({
  ...note,
  id: createId(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const applyImportToState = (
  current: TodoayState,
  incoming: TodoayExportData,
  resolutions: Record<string, ImportConflictResolution>,
) => {
  const next = normalizeState(current);
  const normalizedIncoming = normalizeState({
    todosByDate: incoming.tasks,
    noteIdsByDate: incoming.noteIdsByDate,
    noteDocs: incoming.noteDocs,
    undatedEntries: incoming.undatedEntries,
    themeMode: current.themeMode,
    copyToBehavior: current.copyToBehavior,
  });

  const todoDates = new Set([
    ...Object.keys(next.todosByDate),
    ...Object.keys(normalizedIncoming.todosByDate),
  ]);

  todoDates.forEach((date) => {
    const localItems = [...(next.todosByDate[date] ?? [])];
    const incomingItems = normalizedIncoming.todosByDate[date] ?? [];

    incomingItems.forEach((incomingTodo) => {
      const sameTodoIndex = localItems.findIndex((item) => isSameTodo(item, incomingTodo));
      if (sameTodoIndex !== -1) {
        return;
      }

      const conflictIndex = localItems.findIndex((item) => item.id === incomingTodo.id);
      if (conflictIndex === -1) {
        localItems.push(incomingTodo);
        return;
      }

      const resolution = resolutions[`todo:${date}:${incomingTodo.id}`] ?? "existing";
      if (resolution === "incoming") {
        localItems[conflictIndex] = incomingTodo;
      } else if (resolution === "both") {
        localItems.push(cloneTodoForImport(incomingTodo, date));
      }
    });

    next.todosByDate[date] = localItems;
  });

  const allIncomingNoteIds = new Set(Object.keys(normalizedIncoming.noteDocs));
  const noteDatesById = new Map<string, Set<string>>();

  Object.entries(next.noteIdsByDate).forEach(([date, ids]) => {
    ids.forEach((id) => {
      const dates = noteDatesById.get(id) ?? new Set<string>();
      dates.add(date);
      noteDatesById.set(id, dates);
    });
  });

  Object.entries(normalizedIncoming.noteIdsByDate).forEach(([date, ids]) => {
    ids.forEach((id) => {
      const dates = noteDatesById.get(id) ?? new Set<string>();
      dates.add(date);
      noteDatesById.set(id, dates);
      allIncomingNoteIds.add(id);
    });
  });

  allIncomingNoteIds.forEach((noteId) => {
    const incomingDoc = normalizedIncoming.noteDocs[noteId];
    if (!incomingDoc) {
      return;
    }

    const localDoc = next.noteDocs[noteId];
    const targetDates = Array.from(noteDatesById.get(noteId) ?? []);

    if (!localDoc) {
      next.noteDocs[noteId] = incomingDoc;
      targetDates.forEach((date) => {
        const existingIds = next.noteIdsByDate[date] ?? [];
        next.noteIdsByDate[date] = existingIds.includes(noteId) ? existingIds : [...existingIds, noteId];
      });
      return;
    }

    if (isSameNote(localDoc, incomingDoc)) {
      targetDates.forEach((date) => {
        const existingIds = next.noteIdsByDate[date] ?? [];
        next.noteIdsByDate[date] = existingIds.includes(noteId) ? existingIds : [...existingIds, noteId];
      });
      return;
    }

    const resolution = resolutions[`note:${noteId}`] ?? "existing";
    if (resolution === "incoming") {
      next.noteDocs[noteId] = incomingDoc;
      targetDates.forEach((date) => {
        const existingIds = next.noteIdsByDate[date] ?? [];
        next.noteIdsByDate[date] = existingIds.includes(noteId) ? existingIds : [...existingIds, noteId];
      });
      return;
    }

    if (resolution === "both") {
      const clonedNote = cloneNoteForImport(incomingDoc);
      next.noteDocs[clonedNote.id] = clonedNote;
      targetDates.forEach((date) => {
        const importedIds = normalizedIncoming.noteIdsByDate[date] ?? [];
        const existingIds = next.noteIdsByDate[date] ?? [];
        if (importedIds.includes(noteId) && !existingIds.includes(clonedNote.id)) {
          next.noteIdsByDate[date] = [...existingIds, clonedNote.id];
        }
      });
    } else {
      targetDates.forEach((date) => {
        const existingIds = next.noteIdsByDate[date] ?? [];
        next.noteIdsByDate[date] = existingIds.includes(noteId) ? existingIds : [...existingIds, noteId];
      });
    }
  });

  const existingUndatedKeys = new Set(next.undatedEntries.map((entry) => `${entry.type}:${entry.title}:${entry.text}`));
  normalizedIncoming.undatedEntries.forEach((entry) => {
    const key = `${entry.type}:${entry.title}:${entry.text}`;
    if (!existingUndatedKeys.has(key)) {
      next.undatedEntries.push({
        ...entry,
        id: createId(),
        items: entry.items.map((item) => ({ ...item, id: createId() })),
      });
      existingUndatedKeys.add(key);
    }
  });

  return next;
};

const buildImportConflicts = (current: TodoayState, incoming: TodoayExportData): ImportConflict[] => {
  const normalizedCurrent = normalizeState(current);
  const normalizedIncoming = normalizeState({
    todosByDate: incoming.tasks,
    noteIdsByDate: incoming.noteIdsByDate,
    noteDocs: incoming.noteDocs,
    undatedEntries: incoming.undatedEntries,
    themeMode: current.themeMode,
    copyToBehavior: current.copyToBehavior,
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

type StoreValue = {
  ready: boolean;
  state: TodoayState;
  resolvedTheme: Exclude<ThemeMode, "system">;
  setThemeMode: (themeMode: ThemeMode) => void;
  setCopyToBehavior: (copyToBehavior: CopyToBehavior) => void;
  exportData: () => TodoayExportData;
  getImportConflicts: (incoming: TodoayExportData) => ImportConflict[];
  importData: (
    incoming: TodoayExportData,
    resolutions?: Record<string, ImportConflictResolution>,
  ) => void;
  addTodo: (date: string) => string;
  updateTodo: (date: string, todoId: string, patch: Partial<TodoItem>) => void;
  deleteTodo: (date: string, todoId: string) => void;
  reorderTodo: (date: string, todoId: string, targetTodoId: string, placement: "before" | "after") => void;
  copyTodoToDate: (fromDate: string, todoId: string, toDate: string) => void;
  copyTodoReferenceToDate: (fromDate: string, todoId: string, toDate: string) => void;
  moveTodoReferenceToDate: (fromDate: string, todoId: string, toDate: string) => void;
  addNote: (date: string) => string;
  updateNoteDoc: (noteId: string, patch: Partial<NoteDocument>) => void;
  removeNoteFromDate: (date: string, noteId: string) => void;
  carryNoteToDate: (fromDate: string, noteId: string, toDate: string) => void;
  addUndatedEntry: (type: "list" | "note") => void;
  updateUndatedEntry: (entryId: string, patch: Partial<UndatedEntry>) => void;
  deleteUndatedEntry: (entryId: string) => void;
  addUndatedChecklistItem: (entryId: string) => void;
  updateUndatedChecklistItem: (
    entryId: string,
    itemId: string,
    patch: Partial<UndatedChecklistItem>,
  ) => void;
  deleteUndatedChecklistItem: (entryId: string, itemId: string) => void;
  getVisibleTodos: (date: string, today: string) => TodoItem[];
  getVisibleNoteIds: (date: string, today: string) => string[];
  getDatesForNote: (noteId: string) => string[];
};

const TodoayContext = createContext<StoreValue | null>(null);

export function TodoayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TodoayState>(createInitialState);
  const [ready, setReady] = useState(false);
  const [systemTheme, setSystemTheme] = useState<Exclude<ThemeMode, "system">>("dark");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setState(normalizeState(JSON.parse(raw) as TodoayState));
      }
    } catch (error) {
      console.error("Failed to load Todoay state", error);
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

  const resolvedTheme = state.themeMode === "system" ? systemTheme : state.themeMode;

  useEffect(() => {
    applyThemeChrome(resolvedTheme);
  }, [resolvedTheme]);

  const addTodo = useCallback<StoreValue["addTodo"]>((date) => {
    const nextTodo: TodoItem = {
      id: createId(),
      referenceId: createId(),
      text: "",
      completed: false,
      pinned: false,
      createdAt: new Date().toISOString(),
      sourceDate: date,
    };

    setState((current) => ({
      ...current,
      todosByDate: {
        ...current.todosByDate,
        [date]: [...(current.todosByDate[date] ?? []), nextTodo],
      },
    }));

    return nextTodo.id;
  }, []);

  const value = useMemo<StoreValue>(() => ({
    ready,
    state,
    resolvedTheme,
    setThemeMode(themeMode) {
      setState((current) => ({ ...current, themeMode }));
    },
    setCopyToBehavior(copyToBehavior) {
      setState((current) => ({ ...current, copyToBehavior }));
    },
    exportData() {
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        tasks: state.todosByDate,
        noteIdsByDate: state.noteIdsByDate,
        noteDocs: state.noteDocs,
        undatedEntries: state.undatedEntries,
      };
    },
    getImportConflicts(incoming) {
      return buildImportConflicts(state, incoming);
    },
    importData(incoming, resolutions = {}) {
      setState((current) => applyImportToState(current, incoming, resolutions));
    },
    addTodo,
    updateTodo(date, todoId, patch) {
      setState((current) => {
        const sourceTodo = (current.todosByDate[date] ?? []).find((todo) => todo.id === todoId);
        if (!sourceTodo) {
          return current;
        }
        const sharedPatch = {
          text: patch.text,
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
                        Object.entries(sharedPatch).filter(([, value]) => value !== undefined),
                      ),
                    }
                  : todo.id === todoId && todoDate === date
                    ? { ...todo, ...patch }
                    : todo,
              ),
            ]),
          ),
        };
      });
    },
    deleteTodo(date, todoId) {
      setState((current) => ({
        ...current,
        todosByDate: {
          ...current.todosByDate,
          [date]: (current.todosByDate[date] ?? []).filter((todo) => todo.id !== todoId),
        },
      }));
    },
    reorderTodo(date, todoId, targetTodoId, placement) {
      setState((current) => {
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

        const nextOpen = sourceTodo.completed ? items.filter((todo) => !todo.completed) : nextGroup;
        const nextCompleted = sourceTodo.completed ? nextGroup : items.filter((todo) => todo.completed);

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
      setState((current) => {
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
          createdAt: new Date().toISOString(),
          copiedFromDate: fromDate,
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
      setState((current) => {
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
      setState((current) => {
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
              : [...targetTodos, { ...sourceTodo, sourceDate: toDate }],
          },
        };
      });
    },
    addNote(date) {
      const noteId = createId();
      const now = new Date().toISOString();
      const noteDoc: NoteDocument = {
        id: noteId,
        title: "Untitled note",
        content: "",
        pinned: false,
        createdAt: now,
        updatedAt: now,
      };

      setState((current) => {
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
        };
      });

      return noteId;
    },
    updateNoteDoc(noteId, patch) {
      setState((current) => {
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
              updatedAt: new Date().toISOString(),
            },
          },
        };
      });
    },
    removeNoteFromDate(date, noteId) {
      setState((current) => ({
        ...current,
        noteIdsByDate: {
          ...current.noteIdsByDate,
          [date]: (current.noteIdsByDate[date] ?? []).filter((id) => id !== noteId),
        },
      }));
    },
    carryNoteToDate(fromDate, noteId, toDate) {
      setState((current) => {
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
        };
      });
    },
    addUndatedEntry(type) {
      setState((current) => ({
        ...current,
        undatedEntries: [
          ...current.undatedEntries,
          {
            id: createId(),
            type,
            title: type === "list" ? "Untitled list" : "Untitled note",
            text: "",
            items: type === "list" ? [{ id: createId(), text: "", completed: false }] : [],
          },
        ],
      }));
    },
    updateUndatedEntry(entryId, patch) {
      setState((current) => ({
        ...current,
        undatedEntries: current.undatedEntries.map((entry) =>
          entry.id === entryId ? { ...entry, ...patch } : entry,
        ),
      }));
    },
    deleteUndatedEntry(entryId) {
      setState((current) => ({
        ...current,
        undatedEntries: current.undatedEntries.filter((entry) => entry.id !== entryId),
      }));
    },
    addUndatedChecklistItem(entryId) {
      setState((current) => ({
        ...current,
        undatedEntries: current.undatedEntries.map((entry) => {
          if (entry.id !== entryId || entry.type !== "list") {
            return entry;
          }
          return {
            ...entry,
            items: [...entry.items, { id: createId(), text: "", completed: false }],
          };
        }),
      }));
    },
    updateUndatedChecklistItem(entryId, itemId, patch) {
      setState((current) => ({
        ...current,
        undatedEntries: current.undatedEntries.map((entry) => {
          if (entry.id !== entryId || entry.type !== "list") {
            return entry;
          }
          return {
            ...entry,
            items: entry.items.map((item) =>
              item.id === itemId ? { ...item, ...patch } : item,
            ),
          };
        }),
      }));
    },
    deleteUndatedChecklistItem(entryId, itemId) {
      setState((current) => ({
        ...current,
        undatedEntries: current.undatedEntries.map((entry) => {
          if (entry.id !== entryId || entry.type !== "list") {
            return entry;
          }
          return {
            ...entry,
            items: entry.items.filter((item) => item.id !== itemId),
          };
        }),
      }));
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
  }), [addTodo, ready, resolvedTheme, state]);

  return <TodoayContext.Provider value={value}>{children}</TodoayContext.Provider>;
}

export function useTodoay() {
  const context = useContext(TodoayContext);
  if (!context) {
    throw new Error("useTodoay must be used within TodoayProvider");
  }
  return context;
}
