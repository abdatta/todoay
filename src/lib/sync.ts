"use client";

import type {
  CopyToBehavior,
  DeletionStamp,
  MutationStamp,
  NoteDocument,
  ThemeMode,
  TodoItem,
  TodoayState,
  TodoaySyncMetadata,
  UndatedChecklistItem,
  UndatedEntry,
} from "@/lib/types";

export const STATE_SCHEMA_VERSION = 2 as const;

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const createLegacyMutationId = (kind: string, key: string, timestamp: string) =>
  `legacy:${kind}:${key}:${timestamp}`;

export const createMutationStamp = (updatedAt: string, mutationId: string): MutationStamp => ({
  updatedAt,
  mutationId,
});

export const compareStampedValues = (
  left: Pick<MutationStamp, "updatedAt" | "mutationId">,
  right: Pick<MutationStamp, "updatedAt" | "mutationId">,
) => {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt.localeCompare(right.updatedAt);
  }
  return left.mutationId.localeCompare(right.mutationId);
};

export const compareDeletionStamps = (left: DeletionStamp, right: DeletionStamp) => {
  if (left.deletedAt !== right.deletedAt) {
    return left.deletedAt.localeCompare(right.deletedAt);
  }
  return left.mutationId.localeCompare(right.mutationId);
};

export const createInitialSyncMetadata = (timestamp = DEFAULT_TIMESTAMP): TodoaySyncMetadata => ({
  schemaVersion: STATE_SCHEMA_VERSION,
  todoTombstones: {},
  noteTombstones: {},
  noteLinkMetadata: {},
  noteLinkTombstones: {},
  undatedEntryTombstones: {},
  undatedChecklistItemTombstones: {},
  settings: {
    themeMode: createMutationStamp(timestamp, createLegacyMutationId("setting", "themeMode", timestamp)),
    copyToBehavior: createMutationStamp(timestamp, createLegacyMutationId("setting", "copyToBehavior", timestamp)),
  },
});

export const createInitialState = (timestamp = DEFAULT_TIMESTAMP): TodoayState => ({
  todosByDate: {},
  noteIdsByDate: {},
  noteDocs: {},
  undatedEntries: [],
  themeMode: "system",
  copyToBehavior: "reference",
  syncMetadata: createInitialSyncMetadata(timestamp),
});

const normalizeMutationStamp = (
  input: Partial<MutationStamp> | undefined,
  fallbackKind: string,
  fallbackKey: string,
  fallbackTimestamp = DEFAULT_TIMESTAMP,
): MutationStamp => {
  const updatedAt = input?.updatedAt ?? fallbackTimestamp;
  return {
    updatedAt,
    mutationId: input?.mutationId ?? createLegacyMutationId(fallbackKind, fallbackKey, updatedAt),
  };
};

const normalizeDeletionStamp = (
  input: Partial<DeletionStamp> | undefined,
  fallbackKind: string,
  fallbackKey: string,
  fallbackTimestamp = DEFAULT_TIMESTAMP,
): DeletionStamp => {
  const deletedAt = input?.deletedAt ?? fallbackTimestamp;
  return {
    deletedAt,
    mutationId: input?.mutationId ?? createLegacyMutationId(`${fallbackKind}:delete`, fallbackKey, deletedAt),
  };
};

const sortObjectEntries = <T>(record: Record<string, T>) =>
  Object.entries(record).sort(([left], [right]) => left.localeCompare(right));

const normalizeTodo = (todo: Partial<TodoItem>, date: string, index: number): TodoItem => {
  const id = todo.id ?? `${date}:${index}`;
  const createdAt = todo.createdAt ?? DEFAULT_TIMESTAMP;
  const updatedAt = todo.updatedAt ?? createdAt;
  const durationMinutes =
    typeof todo.durationMinutes === "number" && Number.isFinite(todo.durationMinutes) && todo.durationMinutes > 0
      ? Math.floor(todo.durationMinutes)
      : undefined;

  return {
    id,
    referenceId: todo.referenceId ?? id,
    text: todo.text ?? "",
    durationMinutes,
    completed: todo.completed ?? false,
    pinned: todo.pinned ?? false,
    createdAt,
    updatedAt,
    mutationId: todo.mutationId ?? createLegacyMutationId("todo", id, updatedAt),
    sortOrder: typeof todo.sortOrder === "number" ? todo.sortOrder : (index + 1) * 1024,
    sourceDate: todo.sourceDate ?? date,
    copiedFromDate: todo.copiedFromDate,
  };
};

const normalizeNote = (note: Partial<NoteDocument>, noteId: string): NoteDocument => {
  const createdAt = note.createdAt ?? DEFAULT_TIMESTAMP;
  const updatedAt = note.updatedAt ?? createdAt;

  return {
    id: note.id ?? noteId,
    title: note.title ?? "Untitled note",
    content: note.content ?? "",
    pinned: note.pinned ?? false,
    createdAt,
    updatedAt,
    mutationId: note.mutationId ?? createLegacyMutationId("note", note.id ?? noteId, updatedAt),
  };
};

const normalizeChecklistItem = (
  item: Partial<UndatedChecklistItem>,
  fallbackKey: string,
  index: number,
  fallbackTimestamp: string,
): UndatedChecklistItem => {
  const id = item.id ?? `${fallbackKey}:item:${index}`;
  const createdAt = item.createdAt ?? fallbackTimestamp;
  const updatedAt = item.updatedAt ?? createdAt;

  return {
    id,
    text: item.text ?? "",
    completed: item.completed ?? false,
    createdAt,
    updatedAt,
    mutationId: item.mutationId ?? createLegacyMutationId("undated-item", id, updatedAt),
  };
};

const normalizeUndatedEntry = (entry: Partial<UndatedEntry>, index: number): UndatedEntry => {
  const id = entry.id ?? `undated:${index}`;
  const createdAt = entry.createdAt ?? DEFAULT_TIMESTAMP;
  const updatedAt = entry.updatedAt ?? createdAt;
  const type = entry.type ?? "note";

  return {
    id,
    type,
    title: entry.title ?? (type === "list" ? "Untitled list" : "Untitled note"),
    text: entry.text ?? "",
    items: (entry.items ?? []).map((item, itemIndex) =>
      normalizeChecklistItem(item, id, itemIndex, createdAt),
    ),
    createdAt,
    updatedAt,
    mutationId: entry.mutationId ?? createLegacyMutationId("undated-entry", id, updatedAt),
  };
};

const normalizeSyncMetadata = (
  input: Partial<TodoayState> | undefined,
  noteDocs: Record<string, NoteDocument>,
): TodoaySyncMetadata => {
  const existingMetadata = input?.syncMetadata;
  const noteLinkMetadata: Record<string, Record<string, MutationStamp>> = {};

  sortObjectEntries(input?.noteIdsByDate ?? {}).forEach(([date, noteIds]) => {
    noteIds.forEach((noteId, index) => {
      const existingStamp = existingMetadata?.noteLinkMetadata?.[date]?.[noteId];
      const note = noteDocs[noteId];
      const fallbackTimestamp = note?.updatedAt ?? note?.createdAt ?? DEFAULT_TIMESTAMP;
      const fallbackKey = `${date}:${noteId}:${index}`;
      noteLinkMetadata[date] = {
        ...(noteLinkMetadata[date] ?? {}),
        [noteId]: normalizeMutationStamp(existingStamp, "note-link", fallbackKey, fallbackTimestamp),
      };
    });
  });

  const mergedNoteLinkMetadata = sortObjectEntries(existingMetadata?.noteLinkMetadata ?? {}).reduce<
    Record<string, Record<string, MutationStamp>>
  >((accumulator, [date, entries]) => {
    const nextEntries = { ...(accumulator[date] ?? {}) };
    sortObjectEntries(entries).forEach(([noteId, stamp]) => {
      nextEntries[noteId] = normalizeMutationStamp(stamp, "note-link", `${date}:${noteId}`);
    });
    accumulator[date] = nextEntries;
    return accumulator;
  }, noteLinkMetadata);

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    todoTombstones: sortObjectEntries(existingMetadata?.todoTombstones ?? {}).reduce<Record<string, DeletionStamp>>(
      (accumulator, [todoId, stamp]) => {
        accumulator[todoId] = normalizeDeletionStamp(stamp, "todo", todoId);
        return accumulator;
      },
      {},
    ),
    noteTombstones: sortObjectEntries(existingMetadata?.noteTombstones ?? {}).reduce<Record<string, DeletionStamp>>(
      (accumulator, [noteId, stamp]) => {
        accumulator[noteId] = normalizeDeletionStamp(stamp, "note", noteId);
        return accumulator;
      },
      {},
    ),
    noteLinkMetadata: mergedNoteLinkMetadata,
    noteLinkTombstones: sortObjectEntries(existingMetadata?.noteLinkTombstones ?? {}).reduce<
      Record<string, Record<string, DeletionStamp>>
    >((accumulator, [date, entries]) => {
      accumulator[date] = sortObjectEntries(entries).reduce<Record<string, DeletionStamp>>(
        (dateAccumulator, [noteId, stamp]) => {
          dateAccumulator[noteId] = normalizeDeletionStamp(stamp, "note-link", `${date}:${noteId}`);
          return dateAccumulator;
        },
        {},
      );
      return accumulator;
    }, {}),
    undatedEntryTombstones: sortObjectEntries(
      existingMetadata?.undatedEntryTombstones ?? {},
    ).reduce<Record<string, DeletionStamp>>((accumulator, [entryId, stamp]) => {
      accumulator[entryId] = normalizeDeletionStamp(stamp, "undated-entry", entryId);
      return accumulator;
    }, {}),
    undatedChecklistItemTombstones: sortObjectEntries(
      existingMetadata?.undatedChecklistItemTombstones ?? {},
    ).reduce<Record<string, DeletionStamp>>((accumulator, [itemId, stamp]) => {
      accumulator[itemId] = normalizeDeletionStamp(stamp, "undated-item", itemId);
      return accumulator;
    }, {}),
    settings: {
      themeMode: normalizeMutationStamp(
        existingMetadata?.settings?.themeMode,
        "setting",
        "themeMode",
      ),
      copyToBehavior: normalizeMutationStamp(
        existingMetadata?.settings?.copyToBehavior,
        "setting",
        "copyToBehavior",
      ),
    },
  };
};

export const normalizeState = (input?: Partial<TodoayState>): TodoayState => {
  const parsed = {
    ...createInitialState(),
    ...(input ?? {}),
  };

  const todosByDate = sortObjectEntries(parsed.todosByDate ?? {}).reduce<Record<string, TodoItem[]>>(
    (accumulator, [date, items]) => {
      accumulator[date] = (items ?? [])
        .map((todo, index) => normalizeTodo(todo, date, index))
        .sort((left, right) =>
          left.sortOrder - right.sortOrder ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
        );
      return accumulator;
    },
    {},
  );

  const noteDocs = sortObjectEntries(parsed.noteDocs ?? {}).reduce<Record<string, NoteDocument>>(
    (accumulator, [noteId, note]) => {
      accumulator[noteId] = normalizeNote(note, noteId);
      return accumulator;
    },
    {},
  );

  const noteIdsByDate = sortObjectEntries(parsed.noteIdsByDate ?? {}).reduce<Record<string, string[]>>(
    (accumulator, [date, noteIds]) => {
      accumulator[date] = Array.from(new Set(noteIds ?? [])).filter((noteId) => noteDocs[noteId]);
      return accumulator;
    },
    {},
  );

  const undatedEntries = (parsed.undatedEntries ?? [])
    .map((entry, index) => normalizeUndatedEntry(entry, index))
    .sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );

  const syncMetadata = normalizeSyncMetadata(
    {
      ...parsed,
      noteIdsByDate,
      noteDocs,
    },
    noteDocs,
  );

  return {
    ...parsed,
    todosByDate,
    noteIdsByDate,
    noteDocs,
    undatedEntries,
    syncMetadata,
  };
};

const flattenTodos = (state: TodoayState) => {
  const todos = new Map<string, TodoItem>();
  sortObjectEntries(state.todosByDate).forEach(([date, items]) => {
    items.forEach((todo, index) => {
      todos.set(todo.id, normalizeTodo(todo, date, index));
    });
  });
  return todos;
};

const flattenUndatedEntries = (state: TodoayState) => {
  const entries = new Map<string, UndatedEntry>();
  state.undatedEntries.forEach((entry, index) => {
    entries.set(entry.id, normalizeUndatedEntry(entry, index));
  });
  return entries;
};

const pickLatestActive = <T extends MutationStamp>(left: T | null, right: T | null) => {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return compareStampedValues(left, right) >= 0 ? left : right;
};

const pickLatestDeletion = (left?: DeletionStamp, right?: DeletionStamp) => {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return compareDeletionStamps(left, right) >= 0 ? left : right;
};

const deletionWinsAgainstActive = (
  deletion: DeletionStamp | undefined,
  active: Pick<MutationStamp, "updatedAt" | "mutationId"> | null,
) => {
  if (!deletion) {
    return false;
  }
  if (!active) {
    return true;
  }
  return (
    deletion.deletedAt > active.updatedAt ||
    (deletion.deletedAt === active.updatedAt && deletion.mutationId >= active.mutationId)
  );
};

const sortTodosForStorage = (todos: TodoItem[]) =>
  [...todos].sort((left, right) =>
    left.sortOrder - right.sortOrder ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id),
  );

const sortUndatedItems = (items: UndatedChecklistItem[]) =>
  [...items].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) ||
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.id.localeCompare(right.id),
  );

const mergeChecklistItems = (
  localEntry: UndatedEntry | null,
  remoteEntry: UndatedEntry | null,
  mergedTombstones: Record<string, DeletionStamp>,
) => {
  const mergedItems = new Map<string, UndatedChecklistItem>();
  const activeItemIds = new Set<string>();

  const itemIds = new Set<string>();
  (localEntry?.items ?? []).forEach((item) => itemIds.add(item.id));
  (remoteEntry?.items ?? []).forEach((item) => itemIds.add(item.id));

  itemIds.forEach((itemId) => {
    const localItem = localEntry?.items.find((candidate) => candidate.id === itemId) ?? null;
    const remoteItem = remoteEntry?.items.find((candidate) => candidate.id === itemId) ?? null;
    const active = pickLatestActive(localItem, remoteItem);
    const deletion = mergedTombstones[itemId];

    if (!active || deletionWinsAgainstActive(deletion, active)) {
      if (deletion) {
        mergedTombstones[itemId] = deletion;
      }
      return;
    }

    mergedItems.set(itemId, active);
    activeItemIds.add(itemId);
  });

  return {
    items: sortUndatedItems(Array.from(mergedItems.values())),
    activeItemIds,
  };
};

const mergeUndatedEntries = (localState: TodoayState, remoteState: TodoayState) => {
  const localEntries = flattenUndatedEntries(localState);
  const remoteEntries = flattenUndatedEntries(remoteState);
  const entryIds = new Set<string>([...localEntries.keys(), ...remoteEntries.keys()]);
  const mergedEntries = new Map<string, UndatedEntry>();
  const mergedEntryTombstones = { ...localState.syncMetadata.undatedEntryTombstones };

  Object.entries(remoteState.syncMetadata.undatedEntryTombstones).forEach(([entryId, stamp]) => {
    mergedEntryTombstones[entryId] = pickLatestDeletion(mergedEntryTombstones[entryId], stamp)!;
  });

  const mergedChecklistTombstones = { ...localState.syncMetadata.undatedChecklistItemTombstones };
  Object.entries(remoteState.syncMetadata.undatedChecklistItemTombstones).forEach(([itemId, stamp]) => {
    mergedChecklistTombstones[itemId] = pickLatestDeletion(mergedChecklistTombstones[itemId], stamp)!;
  });

  entryIds.forEach((entryId) => {
    const localEntry = localEntries.get(entryId) ?? null;
    const remoteEntry = remoteEntries.get(entryId) ?? null;
    const active = pickLatestActive(localEntry, remoteEntry);
    const deletion = mergedEntryTombstones[entryId];

    if (!active || deletionWinsAgainstActive(deletion, active)) {
      if (deletion) {
        mergedEntryTombstones[entryId] = deletion;
      }
      return;
    }

    const { items, activeItemIds } = mergeChecklistItems(
      localEntry,
      remoteEntry,
      mergedChecklistTombstones,
    );
    activeItemIds.forEach((itemId) => {
      if (mergedChecklistTombstones[itemId]) {
        delete mergedChecklistTombstones[itemId];
      }
    });

    mergedEntries.set(entryId, {
      ...active,
      items,
    });
    delete mergedEntryTombstones[entryId];
  });

  return {
    entries: Array.from(mergedEntries.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    ),
    entryTombstones: mergedEntryTombstones,
    checklistTombstones: mergedChecklistTombstones,
  };
};

export const mergeTodoayStates = (leftInput: TodoayState, rightInput: TodoayState): TodoayState => {
  const left = normalizeState(leftInput);
  const right = normalizeState(rightInput);

  const leftTodos = flattenTodos(left);
  const rightTodos = flattenTodos(right);
  const todoIds = new Set<string>([...leftTodos.keys(), ...rightTodos.keys()]);
  const mergedTodoTombstones = { ...left.syncMetadata.todoTombstones };

  Object.entries(right.syncMetadata.todoTombstones).forEach(([todoId, stamp]) => {
    mergedTodoTombstones[todoId] = pickLatestDeletion(mergedTodoTombstones[todoId], stamp)!;
  });

  const mergedTodosByDate: Record<string, TodoItem[]> = {};

  todoIds.forEach((todoId) => {
    const leftTodo = leftTodos.get(todoId) ?? null;
    const rightTodo = rightTodos.get(todoId) ?? null;
    const active = pickLatestActive(leftTodo, rightTodo);
    const deletion = mergedTodoTombstones[todoId];

    if (!active || deletionWinsAgainstActive(deletion, active)) {
      if (deletion) {
        mergedTodoTombstones[todoId] = deletion;
      }
      return;
    }

    const nextDate = active.sourceDate;
    mergedTodosByDate[nextDate] = [...(mergedTodosByDate[nextDate] ?? []), active];
    delete mergedTodoTombstones[todoId];
  });

  Object.keys(mergedTodosByDate).forEach((date) => {
    mergedTodosByDate[date] = sortTodosForStorage(mergedTodosByDate[date]);
  });

  const noteIds = new Set<string>([
    ...Object.keys(left.noteDocs),
    ...Object.keys(right.noteDocs),
    ...Object.keys(left.syncMetadata.noteTombstones),
    ...Object.keys(right.syncMetadata.noteTombstones),
  ]);
  const mergedNoteDocs: Record<string, NoteDocument> = {};
  const mergedNoteTombstones = { ...left.syncMetadata.noteTombstones };

  Object.entries(right.syncMetadata.noteTombstones).forEach(([noteId, stamp]) => {
    mergedNoteTombstones[noteId] = pickLatestDeletion(mergedNoteTombstones[noteId], stamp)!;
  });

  noteIds.forEach((noteId) => {
    const leftNote = left.noteDocs[noteId] ?? null;
    const rightNote = right.noteDocs[noteId] ?? null;
    const active = pickLatestActive(leftNote, rightNote);
    const deletion = mergedNoteTombstones[noteId];

    if (!active || deletionWinsAgainstActive(deletion, active)) {
      if (deletion) {
        mergedNoteTombstones[noteId] = deletion;
      }
      return;
    }

    mergedNoteDocs[noteId] = active;
    delete mergedNoteTombstones[noteId];
  });

  const mergedNoteLinkMetadata: Record<string, Record<string, MutationStamp>> = {};
  const mergedNoteLinkTombstones: Record<string, Record<string, DeletionStamp>> = {};
  const noteDates = new Set<string>([
    ...Object.keys(left.noteIdsByDate),
    ...Object.keys(right.noteIdsByDate),
    ...Object.keys(left.syncMetadata.noteLinkMetadata),
    ...Object.keys(right.syncMetadata.noteLinkMetadata),
    ...Object.keys(left.syncMetadata.noteLinkTombstones),
    ...Object.keys(right.syncMetadata.noteLinkTombstones),
  ]);
  const mergedNoteIdsByDate: Record<string, string[]> = {};

  Array.from(noteDates)
    .sort((leftDate, rightDate) => leftDate.localeCompare(rightDate))
    .forEach((date) => {
      const noteIdsForDate = new Set<string>([
        ...(left.noteIdsByDate[date] ?? []),
        ...(right.noteIdsByDate[date] ?? []),
        ...Object.keys(left.syncMetadata.noteLinkMetadata[date] ?? {}),
        ...Object.keys(right.syncMetadata.noteLinkMetadata[date] ?? {}),
        ...Object.keys(left.syncMetadata.noteLinkTombstones[date] ?? {}),
        ...Object.keys(right.syncMetadata.noteLinkTombstones[date] ?? {}),
      ]);

      const activeNoteIds: string[] = [];
      const dateMetadata: Record<string, MutationStamp> = {};
      const dateTombstones: Record<string, DeletionStamp> = {};

      Array.from(noteIdsForDate)
        .sort((leftId, rightId) => leftId.localeCompare(rightId))
        .forEach((noteId) => {
          if (!mergedNoteDocs[noteId]) {
            return;
          }

          const leftLink = left.syncMetadata.noteLinkMetadata[date]?.[noteId] ?? null;
          const rightLink = right.syncMetadata.noteLinkMetadata[date]?.[noteId] ?? null;
          const active = pickLatestActive(leftLink, rightLink);
          const deletion = pickLatestDeletion(
            left.syncMetadata.noteLinkTombstones[date]?.[noteId],
            right.syncMetadata.noteLinkTombstones[date]?.[noteId],
          );

          if (!active || deletionWinsAgainstActive(deletion, active)) {
            if (deletion) {
              dateTombstones[noteId] = deletion;
            }
            return;
          }

          activeNoteIds.push(noteId);
          dateMetadata[noteId] = active;
        });

      const orderedNoteIds = activeNoteIds.sort((leftId, rightId) => {
        const leftStamp = dateMetadata[leftId];
        const rightStamp = dateMetadata[rightId];
        return (
          leftStamp.updatedAt.localeCompare(rightStamp.updatedAt) ||
          mergedNoteDocs[leftId].createdAt.localeCompare(mergedNoteDocs[rightId].createdAt) ||
          leftId.localeCompare(rightId)
        );
      });

      if (orderedNoteIds.length > 0) {
        mergedNoteIdsByDate[date] = orderedNoteIds;
        mergedNoteLinkMetadata[date] = orderedNoteIds.reduce<Record<string, MutationStamp>>(
          (accumulator, noteId) => {
            accumulator[noteId] = dateMetadata[noteId];
            return accumulator;
          },
          {},
        );
      }

      if (Object.keys(dateTombstones).length > 0) {
        mergedNoteLinkTombstones[date] = dateTombstones;
      }
    });

  const { entries, entryTombstones, checklistTombstones } = mergeUndatedEntries(left, right);

  const themeMode =
    compareStampedValues(left.syncMetadata.settings.themeMode, right.syncMetadata.settings.themeMode) >= 0
      ? left.themeMode
      : right.themeMode;
  const copyToBehavior =
    compareStampedValues(
      left.syncMetadata.settings.copyToBehavior,
      right.syncMetadata.settings.copyToBehavior,
    ) >= 0
      ? left.copyToBehavior
      : right.copyToBehavior;

  return normalizeState({
    todosByDate: mergedTodosByDate,
    noteIdsByDate: mergedNoteIdsByDate,
    noteDocs: mergedNoteDocs,
    undatedEntries: entries,
    themeMode: themeMode as ThemeMode,
    copyToBehavior: copyToBehavior as CopyToBehavior,
    syncMetadata: {
      schemaVersion: STATE_SCHEMA_VERSION,
      todoTombstones: mergedTodoTombstones,
      noteTombstones: mergedNoteTombstones,
      noteLinkMetadata: mergedNoteLinkMetadata,
      noteLinkTombstones: mergedNoteLinkTombstones,
      undatedEntryTombstones: entryTombstones,
      undatedChecklistItemTombstones: checklistTombstones,
      settings: {
        themeMode: pickLatestActive(
          left.syncMetadata.settings.themeMode,
          right.syncMetadata.settings.themeMode,
        )!,
        copyToBehavior: pickLatestActive(
          left.syncMetadata.settings.copyToBehavior,
          right.syncMetadata.settings.copyToBehavior,
        )!,
      },
    },
  });
};

export const serializeState = (input: TodoayState) => JSON.stringify(normalizeState(input));

export const getNextTodoSortOrder = (items: TodoItem[]) => {
  const lastItem = [...items].sort((left, right) => right.sortOrder - left.sortOrder)[0];
  return (lastItem?.sortOrder ?? 0) + 1024;
};
