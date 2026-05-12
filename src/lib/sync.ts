"use client";

import type {
  CopyToBehavior,
  DeletionStamp,
  MutationStamp,
  NoteDocument,
  ThreadRecord,
  ThreadTaskItem,
  ThemeMode,
  TodoItem,
  TodoayState,
  TodoaySyncMetadata,
} from "@/lib/types";

export const STATE_SCHEMA_VERSION = 3 as const;

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
  threadTombstones: {},
  threadTaskTombstones: {},
  settings: {
    themeMode: createMutationStamp(timestamp, createLegacyMutationId("setting", "themeMode", timestamp)),
    copyToBehavior: createMutationStamp(timestamp, createLegacyMutationId("setting", "copyToBehavior", timestamp)),
  },
});

export const createInitialState = (timestamp = DEFAULT_TIMESTAMP): TodoayState => ({
  todosByDate: {},
  noteIdsByDate: {},
  noteDocs: {},
  threads: [],
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
    threadId: todo.threadId,
    threadTaskId: todo.threadTaskId,
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

const normalizeThreadTask = (
  task: Partial<ThreadTaskItem>,
  threadId: string,
  index: number,
  fallbackTimestamp: string,
): ThreadTaskItem => {
  const id = task.id ?? `${threadId}:task:${index}`;
  const createdAt = task.createdAt ?? fallbackTimestamp;
  const updatedAt = task.updatedAt ?? createdAt;
  const durationMinutes =
    typeof task.durationMinutes === "number" && Number.isFinite(task.durationMinutes) && task.durationMinutes > 0
      ? Math.floor(task.durationMinutes)
      : undefined;

  return {
    id,
    referenceId: task.referenceId ?? id,
    text: task.text ?? "",
    durationMinutes,
    completed: task.completed ?? false,
    createdAt,
    updatedAt,
    mutationId: task.mutationId ?? createLegacyMutationId("thread-task", id, updatedAt),
    sortOrder: typeof task.sortOrder === "number" ? task.sortOrder : (index + 1) * 1024,
  };
};

const normalizeThread = (thread: Partial<ThreadRecord>, index: number): ThreadRecord => {
  const id = thread.id ?? `thread:${index}`;
  const createdAt = thread.createdAt ?? DEFAULT_TIMESTAMP;
  const updatedAt = thread.updatedAt ?? createdAt;

  return {
    id,
    title: thread.title ?? "Untitled thread",
    pinned: thread.pinned ?? false,
    archived: thread.archived ?? false,
    createdAt,
    updatedAt,
    mutationId: thread.mutationId ?? createLegacyMutationId("thread", id, updatedAt),
    sortOrder: typeof thread.sortOrder === "number" ? thread.sortOrder : (index + 1) * 1024,
    tasks: (thread.tasks ?? [])
      .map((task, taskIndex) => normalizeThreadTask(task, id, taskIndex, createdAt))
      .sort((left, right) =>
        left.sortOrder - right.sortOrder ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
      ),
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
    threadTombstones: sortObjectEntries(
      existingMetadata?.threadTombstones ?? {},
    ).reduce<Record<string, DeletionStamp>>((accumulator, [threadId, stamp]) => {
      accumulator[threadId] = normalizeDeletionStamp(stamp, "thread", threadId);
      return accumulator;
    }, {}),
    threadTaskTombstones: sortObjectEntries(
      existingMetadata?.threadTaskTombstones ?? {},
    ).reduce<Record<string, DeletionStamp>>((accumulator, [taskId, stamp]) => {
      accumulator[taskId] = normalizeDeletionStamp(stamp, "thread-task", taskId);
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

  const threads = (parsed.threads ?? [])
    .map((thread, index) => normalizeThread(thread, index))
    .sort((left, right) =>
      Number(left.archived) - Number(right.archived) ||
      Number(right.pinned) - Number(left.pinned) ||
      left.sortOrder - right.sortOrder ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
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
    threads,
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

const flattenThreads = (state: TodoayState) => {
  const threads = new Map<string, ThreadRecord>();
  state.threads.forEach((thread, index) => {
    threads.set(thread.id, normalizeThread(thread, index));
  });
  return threads;
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

const sortThreadTasks = (tasks: ThreadTaskItem[]) =>
  [...tasks].sort((left, right) =>
    left.sortOrder - right.sortOrder ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id),
  );

const mergeThreadTasks = (
  localThread: ThreadRecord | null,
  remoteThread: ThreadRecord | null,
  mergedTombstones: Record<string, DeletionStamp>,
) => {
  const mergedTasks = new Map<string, ThreadTaskItem>();
  const activeTaskIds = new Set<string>();
  const taskIds = new Set<string>();

  (localThread?.tasks ?? []).forEach((task) => taskIds.add(task.id));
  (remoteThread?.tasks ?? []).forEach((task) => taskIds.add(task.id));

  taskIds.forEach((taskId) => {
    const localTask = localThread?.tasks.find((candidate) => candidate.id === taskId) ?? null;
    const remoteTask = remoteThread?.tasks.find((candidate) => candidate.id === taskId) ?? null;
    const active = pickLatestActive(localTask, remoteTask);
    const deletion = mergedTombstones[taskId];

    if (!active || deletionWinsAgainstActive(deletion, active)) {
      if (deletion) {
        mergedTombstones[taskId] = deletion;
      }
      return;
    }

    mergedTasks.set(taskId, active);
    activeTaskIds.add(taskId);
  });

  return {
    tasks: sortThreadTasks(Array.from(mergedTasks.values())),
    activeTaskIds,
  };
};

const mergeThreads = (localState: TodoayState, remoteState: TodoayState) => {
  const localThreads = flattenThreads(localState);
  const remoteThreads = flattenThreads(remoteState);
  const threadIds = new Set<string>([...localThreads.keys(), ...remoteThreads.keys()]);
  const mergedThreads = new Map<string, ThreadRecord>();
  const mergedThreadTombstones = { ...localState.syncMetadata.threadTombstones };
  const mergedThreadTaskTombstones = { ...localState.syncMetadata.threadTaskTombstones };

  Object.entries(remoteState.syncMetadata.threadTombstones).forEach(([threadId, stamp]) => {
    mergedThreadTombstones[threadId] = pickLatestDeletion(mergedThreadTombstones[threadId], stamp)!;
  });
  Object.entries(remoteState.syncMetadata.threadTaskTombstones).forEach(([taskId, stamp]) => {
    mergedThreadTaskTombstones[taskId] = pickLatestDeletion(mergedThreadTaskTombstones[taskId], stamp)!;
  });

  threadIds.forEach((threadId) => {
    const localThread = localThreads.get(threadId) ?? null;
    const remoteThread = remoteThreads.get(threadId) ?? null;
    const active = pickLatestActive(localThread, remoteThread);
    const deletion = mergedThreadTombstones[threadId];

    if (!active || deletionWinsAgainstActive(deletion, active)) {
      if (deletion) {
        mergedThreadTombstones[threadId] = deletion;
      }
      return;
    }

    const { tasks, activeTaskIds } = mergeThreadTasks(
      localThread,
      remoteThread,
      mergedThreadTaskTombstones,
    );
    activeTaskIds.forEach((taskId) => {
      if (mergedThreadTaskTombstones[taskId]) {
        delete mergedThreadTaskTombstones[taskId];
      }
    });

    mergedThreads.set(threadId, {
      ...active,
      tasks,
    });
    delete mergedThreadTombstones[threadId];
  });

  return {
    threads: Array.from(mergedThreads.values()).sort((left, right) =>
      Number(left.archived) - Number(right.archived) ||
      Number(right.pinned) - Number(left.pinned) ||
      left.sortOrder - right.sortOrder ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
    ),
    threadTombstones: mergedThreadTombstones,
    threadTaskTombstones: mergedThreadTaskTombstones,
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

  const { threads, threadTombstones, threadTaskTombstones } = mergeThreads(left, right);

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
    threads,
    themeMode: themeMode as ThemeMode,
    copyToBehavior: copyToBehavior as CopyToBehavior,
    syncMetadata: {
      schemaVersion: STATE_SCHEMA_VERSION,
      todoTombstones: mergedTodoTombstones,
      noteTombstones: mergedNoteTombstones,
      noteLinkMetadata: mergedNoteLinkMetadata,
      noteLinkTombstones: mergedNoteLinkTombstones,
      threadTombstones,
      threadTaskTombstones,
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
