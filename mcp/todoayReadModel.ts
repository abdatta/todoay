import type {
  NoteDocument,
  ThreadRecord,
  ThreadTaskItem,
  TodoayState,
  TodoItem,
} from "../src/lib/types.ts";

export type SearchResult = {
  id: string;
  type: "task" | "note" | "thread" | "thread_task";
  title: string;
  text: string;
  url: string;
  metadata: Record<string, unknown>;
};

export type BacklogEntry = {
  referenceId: string;
  task: TodoItem;
  dates: string[];
  lastDate: string;
};

export type BacklogGroup = {
  key: string;
  dates: string[];
  lastDate: string;
  items: BacklogEntry[];
};

export type NoteIndexEntry = {
  id: string;
  title: string;
  pinned: boolean;
  dates: string[];
  updatedAt: string;
  contentLength: number;
  preview: string;
};

export type ThreadIndexEntry = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  updatedAt: string;
  sortOrder: number;
  taskCount: number;
  openTaskCount: number;
  completedTaskCount: number;
  previewTasks: string[];
};

export type TaskReferenceDetails = {
  id: string;
  type: "task_reference";
  referenceId: string;
  dates: string[];
  openDates: string[];
  completedDates: string[];
  datedInstances: Array<{
    date: string;
    taskId: string;
    task: TodoItem;
    copiedFromDate?: string;
    sourceDate: string;
    threadId?: string;
    threadTaskId?: string;
  }>;
  thread: Pick<ThreadRecord, "id" | "title" | "archived" | "pinned" | "updatedAt"> | null;
  threadTask: ThreadTaskItem | null;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const assertDate = (date: string) => {
  if (!datePattern.test(date)) {
    throw new Error(`Expected date in yyyy-MM-dd format, received "${date}".`);
  }
};

export const todayString = () => new Date().toISOString().slice(0, 10);

export const getStateSummary = (state: TodoayState) => {
  const tasks = Object.values(state.todosByDate).flat();
  const threadTasks = state.threads.flatMap((thread) => thread.tasks);

  return {
    taskCount: tasks.length,
    openTaskCount: tasks.filter((task) => !task.completed && task.text.trim()).length,
    completedTaskCount: tasks.filter((task) => task.completed).length,
    noteCount: Object.keys(state.noteDocs).length,
    threadCount: state.threads.length,
    activeThreadCount: state.threads.filter((thread) => !thread.archived).length,
    archivedThreadCount: state.threads.filter((thread) => thread.archived).length,
    threadTaskCount: threadTasks.length,
    openThreadTaskCount: threadTasks.filter((task) => !task.completed && task.text.trim()).length,
    datesWithTasks: Object.keys(state.todosByDate).filter((date) => (state.todosByDate[date] ?? []).length > 0),
    datesWithNotes: Object.keys(state.noteIdsByDate).filter((date) => (state.noteIdsByDate[date] ?? []).length > 0),
    themeMode: state.themeMode,
    copyToBehavior: state.copyToBehavior,
  };
};

export const getVisibleTodos = (state: TodoayState, date: string, today = todayString()) => {
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
};

export const getVisibleNoteIds = (state: TodoayState, date: string, today = todayString()) => {
  const direct = state.noteIdsByDate[date] ?? [];
  if (date !== today) {
    return direct;
  }

  const pinned = Object.values(state.noteDocs)
    .filter((note) => note.pinned)
    .map((note) => note.id)
    .filter((noteId) => !direct.includes(noteId));

  return [...direct, ...pinned];
};

export const getDatesForNote = (state: TodoayState, noteId: string) =>
  Object.entries(state.noteIdsByDate)
    .filter(([, noteIds]) => noteIds.includes(noteId))
    .map(([date]) => date)
    .sort();

export const getBacklogGroups = (state: TodoayState, today = todayString()): BacklogGroup[] => {
  const futureReferenceIds = new Set<string>();
  const futureCopiedSourceKeys = new Set<string>();
  const entriesByReferenceId = new Map<string, BacklogEntry>();

  Object.entries(state.todosByDate).forEach(([date, todos]) => {
    if (date >= today) {
      todos.forEach((todo) => {
        futureReferenceIds.add(todo.referenceId);
        if (todo.copiedFromDate && todo.text.trim() !== "") {
          futureCopiedSourceKeys.add(`${todo.copiedFromDate}|${todo.text.trim()}`);
        }
      });
    }
  });

  Object.entries(state.todosByDate)
    .filter(([date]) => date < today)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([date, todos]) => {
      [...todos]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .forEach((todo) => {
          if (
            todo.completed ||
            todo.text.trim() === "" ||
            futureReferenceIds.has(todo.referenceId)
          ) {
            return;
          }

          const current = entriesByReferenceId.get(todo.referenceId);
          if (!current) {
            entriesByReferenceId.set(todo.referenceId, {
              referenceId: todo.referenceId,
              task: todo,
              dates: [date],
              lastDate: date,
            });
            return;
          }

          if (!current.dates.includes(date)) {
            current.dates.push(date);
          }

          if (date >= current.lastDate) {
            current.task = todo;
            current.lastDate = date;
          }
        });
    });

  const grouped = new Map<string, BacklogGroup>();
  [...entriesByReferenceId.values()]
    .filter((entry) =>
      !entry.dates.some((date) => futureCopiedSourceKeys.has(`${date}|${entry.task.text.trim()}`)),
    )
    .forEach((entry) => {
      const dates = [...entry.dates].sort((left, right) => right.localeCompare(left));
      const key = dates.join("|");
      const group = grouped.get(key);
      if (group) {
        group.items.push(entry);
        return;
      }

      grouped.set(key, {
        key,
        dates,
        lastDate: dates[0],
        items: [entry],
      });
    });

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => {
        if (left.lastDate !== right.lastDate) {
          return right.lastDate.localeCompare(left.lastDate);
        }
        return left.task.sortOrder - right.task.sortOrder;
      }),
    }))
    .sort((left, right) => right.lastDate.localeCompare(left.lastDate));
};

const todoTitle = (todo: TodoItem) => todo.text.trim() || "Untitled task";
const noteTitle = (note: NoteDocument) => note.title.trim() || "Untitled note";
const threadTitle = (thread: ThreadRecord) => thread.title.trim() || "Untitled thread";
const threadTaskTitle = (task: ThreadTaskItem) => task.text.trim() || "Untitled thread task";

const previewText = (value: string, limit = 180) => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}...` : compact;
};

export const getNoteIndex = (state: TodoayState): NoteIndexEntry[] =>
  Object.values(state.noteDocs)
    .map((note) => ({
      id: note.id,
      title: noteTitle(note),
      pinned: note.pinned,
      dates: getDatesForNote(state, note.id),
      updatedAt: note.updatedAt,
      contentLength: note.content.length,
      preview: previewText(note.content),
    }))
    .sort((left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.title.localeCompare(right.title),
    );

export const getThreadIndex = (state: TodoayState, includeArchived = false): ThreadIndexEntry[] =>
  state.threads
    .filter((thread) => includeArchived || !thread.archived)
    .map((thread) => {
      const openTasks = thread.tasks.filter((task) => !task.completed && task.text.trim());
      return {
        id: thread.id,
        title: threadTitle(thread),
        pinned: thread.pinned,
        archived: thread.archived,
        updatedAt: thread.updatedAt,
        sortOrder: thread.sortOrder,
        taskCount: thread.tasks.length,
        openTaskCount: openTasks.length,
        completedTaskCount: thread.tasks.filter((task) => task.completed).length,
        previewTasks: openTasks
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .slice(0, 5)
          .map((task) => previewText(task.text, 120)),
      };
    })
    .sort((left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      left.sortOrder - right.sortOrder ||
      right.updatedAt.localeCompare(left.updatedAt),
    );

export const getTaskReferenceDetails = (state: TodoayState, referenceId: string): TaskReferenceDetails => {
  const datedInstances = Object.entries(state.todosByDate)
    .flatMap(([date, todos]) =>
      todos
        .filter((todo) => todo.referenceId === referenceId)
        .map((task) => ({
          date,
          taskId: task.id,
          task,
          copiedFromDate: task.copiedFromDate,
          sourceDate: task.sourceDate,
          threadId: task.threadId,
          threadTaskId: task.threadTaskId,
        })),
    )
    .sort((left, right) => left.date.localeCompare(right.date) || left.task.sortOrder - right.task.sortOrder);

  const threadMatch = state.threads
    .flatMap((thread) =>
      thread.tasks
        .filter((task) => task.referenceId === referenceId)
        .map((task) => ({ thread, task })),
    )[0];

  if (datedInstances.length === 0 && !threadMatch) {
    throw new Error(`Task reference not found: ${referenceId}`);
  }

  const dates = datedInstances.map((instance) => instance.date);
  return {
    id: `task-reference:${referenceId}`,
    type: "task_reference",
    referenceId,
    dates,
    openDates: datedInstances
      .filter((instance) => !instance.task.completed)
      .map((instance) => instance.date),
    completedDates: datedInstances
      .filter((instance) => instance.task.completed)
      .map((instance) => instance.date),
    datedInstances,
    thread: threadMatch
      ? {
          id: threadMatch.thread.id,
          title: threadMatch.thread.title,
          archived: threadMatch.thread.archived,
          pinned: threadMatch.thread.pinned,
          updatedAt: threadMatch.thread.updatedAt,
        }
      : null,
    threadTask: threadMatch?.task ?? null,
  };
};

const itemUrl = (id: string) => `todoay://${id}`;

export const buildSearchIndex = (state: TodoayState): SearchResult[] => {
  const taskResults = Object.entries(state.todosByDate).flatMap(([date, todos]) =>
    todos.map((todo) => ({
      id: `task:${date}:${todo.id}`,
      type: "task" as const,
      title: todoTitle(todo),
      text: todo.text,
      url: itemUrl(`task/${todo.referenceId}`),
      metadata: {
        date,
        referenceId: todo.referenceId,
        completed: todo.completed,
        pinned: todo.pinned,
        durationMinutes: todo.durationMinutes,
        threadId: todo.threadId,
      },
    })),
  );

  const noteResults = Object.values(state.noteDocs).map((note) => ({
    id: `note:${note.id}`,
    type: "note" as const,
    title: noteTitle(note),
    text: note.content,
    url: itemUrl(`note/${note.id}`),
    metadata: {
      pinned: note.pinned,
      dates: getDatesForNote(state, note.id),
      updatedAt: note.updatedAt,
    },
  }));

  const threadResults = state.threads.flatMap((thread) => {
    const threadResult: SearchResult = {
      id: `thread:${thread.id}`,
      type: "thread",
      title: threadTitle(thread),
      text: thread.tasks.map((task) => task.text).join("\n"),
      url: itemUrl(`thread/${thread.id}`),
      metadata: {
        pinned: thread.pinned,
        archived: thread.archived,
        taskCount: thread.tasks.length,
        openTaskCount: thread.tasks.filter((task) => !task.completed).length,
      },
    };

    const taskResultsForThread: SearchResult[] = thread.tasks.map((task) => ({
      id: `thread-task:${thread.id}:${task.id}`,
      type: "thread_task",
      title: threadTaskTitle(task),
      text: task.text,
      url: itemUrl(`task/${task.referenceId}`),
      metadata: {
        referenceId: task.referenceId,
        threadId: thread.id,
        threadTitle: threadTitle(thread),
        completed: task.completed,
        durationMinutes: task.durationMinutes,
      },
    }));

    return [threadResult, ...taskResultsForThread];
  });

  return [...taskResults, ...noteResults, ...threadResults];
};

const scoreResult = (result: SearchResult, query: string) => {
  const normalizedQuery = query.toLowerCase().trim();
  const haystack = `${result.title}\n${result.text}\n${JSON.stringify(result.metadata)}`.toLowerCase();
  if (!normalizedQuery) {
    return 1;
  }
  if (haystack.includes(normalizedQuery)) {
    return 100 + normalizedQuery.length;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 10 : 0), 0);
};

export const searchTodoay = (state: TodoayState, query: string, limit = 20) =>
  buildSearchIndex(state)
    .map((result) => ({ result, score: scoreResult(result, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.result.title.localeCompare(right.result.title))
    .slice(0, Math.min(Math.max(Math.floor(limit), 1), 50))
    .map(({ result }) => result);

export const fetchTodoayItem = (state: TodoayState, id: string) => {
  if (id === "overview") {
    return { id, type: "overview", summary: getStateSummary(state) };
  }

  if (id === "backlog") {
    return { id, type: "backlog", groups: getBacklogGroups(state) };
  }

  if (id === "today") {
    const date = todayString();
    const noteIds = getVisibleNoteIds(state, date);
    return {
      id,
      type: "day",
      date,
      tasks: getVisibleTodos(state, date),
      notes: noteIds.map((noteId) => state.noteDocs[noteId]).filter(Boolean),
    };
  }

  if (id === "notes:index") {
    return { id, type: "notes_index", notes: getNoteIndex(state) };
  }

  if (id === "threads:index") {
    return { id, type: "threads_index", threads: getThreadIndex(state) };
  }

  if (id.startsWith("day:")) {
    const date = id.slice("day:".length);
    assertDate(date);
    const noteIds = getVisibleNoteIds(state, date);
    return {
      id,
      type: "day",
      date,
      tasks: getVisibleTodos(state, date),
      notes: noteIds.map((noteId) => state.noteDocs[noteId]).filter(Boolean),
    };
  }

  if (id.startsWith("task:")) {
    const [, date, taskId] = id.split(":");
    assertDate(date);
    const task = (state.todosByDate[date] ?? []).find((todo) => todo.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    return {
      id,
      type: "task",
      date,
      task,
      reference: getTaskReferenceDetails(state, task.referenceId),
    };
  }

  if (id.startsWith("task-reference:")) {
    const referenceId = id.slice("task-reference:".length);
    return getTaskReferenceDetails(state, referenceId);
  }

  if (id.startsWith("note:")) {
    const noteId = id.slice("note:".length);
    const note = state.noteDocs[noteId];
    if (!note) {
      throw new Error(`Note not found: ${id}`);
    }
    return { id, type: "note", note, dates: getDatesForNote(state, noteId) };
  }

  if (id.startsWith("thread:")) {
    const threadId = id.slice("thread:".length);
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${id}`);
    }
    const scheduledTodos = Object.entries(state.todosByDate).flatMap(([date, todos]) =>
      todos
        .filter((todo) => todo.threadId === threadId)
        .map((todo) => ({ date, taskId: todo.threadTaskId, todo })),
    );
    return { id, type: "thread", thread, scheduledTodos };
  }

  if (id.startsWith("thread-task:")) {
    const [, threadId, taskId] = id.split(":");
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    const task = thread?.tasks.find((candidate) => candidate.id === taskId);
    if (!thread || !task) {
      throw new Error(`Thread task not found: ${id}`);
    }
    const scheduledTodos = Object.entries(state.todosByDate).flatMap(([date, todos]) =>
      todos
        .filter((todo) => todo.referenceId === task.referenceId)
        .map((todo) => ({ date, todo })),
    );
    return {
      id,
      type: "thread_task",
      thread,
      task,
      scheduledTodos,
      reference: getTaskReferenceDetails(state, task.referenceId),
    };
  }

  throw new Error(`Unsupported fetch id: ${id}`);
};
