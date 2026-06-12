import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TodoayRepository } from "./todoayRepository.ts";
import {
  assertDate,
  fetchTodoayItem,
  getBacklogGroups,
  getDatesForNote,
  getNoteIndex,
  getStateSummary,
  getTaskReferenceDetails,
  getThreadIndex,
  getVisibleNoteIds,
  getVisibleTodos,
  searchTodoay,
  todayString,
} from "./todoayReadModel.ts";

const jsonResult = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(value, null, 2),
    },
  ],
});

const jsonResource = (uri: string, value: unknown) => ({
  contents: [
    {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(value, null, 2),
    },
  ],
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

type ResourceVariables = Record<string, string | string[]>;

const matchesCompletionQuery = (query: string, values: Array<string | undefined>) => {
  const normalizedQuery = query.toLowerCase().trim();
  return !normalizedQuery || values.some((value) => value?.toLowerCase().includes(normalizedQuery));
};

const uniqueSorted = (values: string[], direction: "asc" | "desc" = "asc") =>
  [...new Set(values)].sort((left, right) =>
    direction === "asc" ? left.localeCompare(right) : right.localeCompare(left),
  );

const limitCompletions = (values: string[]) => values.slice(0, 100);

export const createTodoayMcpServer = (repository: TodoayRepository) => {
  const server = new McpServer({
    name: "todoay",
    version: "0.1.0",
  });

  const completeDate = async (value: string) => {
    const snapshot = await repository.loadSnapshot();
    const dates = uniqueSorted([
      todayString(),
      ...Object.keys(snapshot.state.todosByDate),
      ...Object.keys(snapshot.state.noteIdsByDate),
    ], "desc");

    return limitCompletions(dates.filter((date) => matchesCompletionQuery(value, [date])));
  };

  const completeNoteId = async (value: string) => {
    const snapshot = await repository.loadSnapshot();
    const matches = Object.values(snapshot.state.noteDocs)
      .filter((note) => matchesCompletionQuery(value, [note.id, note.title, note.content]))
      .sort((left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.title.localeCompare(right.title),
      )
      .map((note) => note.id);

    return limitCompletions(matches);
  };

  const completeThreadId = async (value: string) => {
    const snapshot = await repository.loadSnapshot();
    const matches = snapshot.state.threads
      .filter((thread) =>
        matchesCompletionQuery(value, [
          thread.id,
          thread.title,
          ...thread.tasks.map((task) => task.text),
        ]),
      )
      .sort((left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        left.sortOrder - right.sortOrder ||
        right.updatedAt.localeCompare(left.updatedAt),
      )
      .map((thread) => thread.id);

    return limitCompletions(matches);
  };

  const completeTaskReferenceId = async (value: string) => {
    const snapshot = await repository.loadSnapshot();
    const referenceMatches = new Map<string, string[]>();

    Object.entries(snapshot.state.todosByDate).forEach(([date, todos]) => {
      todos.forEach((todo) => {
        const values = referenceMatches.get(todo.referenceId) ?? [];
        values.push(
          ...[todo.referenceId, todo.id, todo.text, date, todo.threadId, todo.threadTaskId]
            .filter((candidate): candidate is string => Boolean(candidate)),
        );
        referenceMatches.set(todo.referenceId, values);
      });
    });

    snapshot.state.threads.forEach((thread) => {
      thread.tasks.forEach((task) => {
        const values = referenceMatches.get(task.referenceId) ?? [];
        values.push(task.referenceId, task.id, task.text, thread.id, thread.title);
        referenceMatches.set(task.referenceId, values);
      });
    });

    return limitCompletions(
      [...referenceMatches.entries()]
        .filter(([, values]) => matchesCompletionQuery(value, values))
        .map(([referenceId]) => referenceId)
        .sort(),
    );
  };

  server.registerTool("get_overview", {
    title: "Get Todoay overview",
    description: "Read high-level counts, settings, current snapshot revision, and sync timestamp.",
    annotations: readOnlyAnnotations,
  }, async () => {
    const snapshot = await repository.loadSnapshot();
    return jsonResult({
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      summary: getStateSummary(snapshot.state),
    });
  });

  server.registerTool("list_day", {
    title: "List a Todoay day",
    description: "Read visible tasks and notes for a yyyy-MM-dd date. Defaults to today.",
    inputSchema: {
      date: z.string().optional().describe("Date in yyyy-MM-dd format. Defaults to today."),
    },
    annotations: readOnlyAnnotations,
  }, async ({ date }: { date?: string }) => {
    const selectedDate = date ?? todayString();
    assertDate(selectedDate);
    const snapshot = await repository.loadSnapshot();
    const noteIds = getVisibleNoteIds(snapshot.state, selectedDate);
    return jsonResult({
      date: selectedDate,
      revision: snapshot.revision,
      tasks: getVisibleTodos(snapshot.state, selectedDate),
      notes: noteIds.map((noteId) => snapshot.state.noteDocs[noteId]).filter(Boolean),
    });
  });

  server.registerTool("list_backlog", {
    title: "List Todoay backlog",
    description: "Read open past tasks that have not been moved or copied into today/future dates.",
    inputSchema: {
      today: z.string().optional().describe("Date in yyyy-MM-dd format for backlog cutoff. Defaults to today."),
    },
    annotations: readOnlyAnnotations,
  }, async ({ today }: { today?: string }) => {
    const cutoff = today ?? todayString();
    assertDate(cutoff);
    const snapshot = await repository.loadSnapshot();
    return jsonResult({
      today: cutoff,
      revision: snapshot.revision,
      groups: getBacklogGroups(snapshot.state, cutoff),
    });
  });

  server.registerTool("list_threads", {
    title: "List Todoay threads",
    description: "Read Todoay threads with task counts. Archived threads are excluded unless requested.",
    inputSchema: {
      includeArchived: z.boolean().optional().default(false),
    },
    annotations: readOnlyAnnotations,
  }, async ({ includeArchived }: { includeArchived?: boolean }) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResult({
      revision: snapshot.revision,
      threads: snapshot.state.threads
        .filter((thread) => includeArchived || !thread.archived)
        .map((thread) => ({
          ...thread,
          taskCount: thread.tasks.length,
          openTaskCount: thread.tasks.filter((task) => !task.completed && task.text.trim()).length,
          completedTaskCount: thread.tasks.filter((task) => task.completed).length,
        })),
    });
  });

  server.registerTool("get_thread", {
    title: "Get Todoay thread",
    description: "Read a thread and any dated todos scheduled from that thread.",
    inputSchema: {
      threadId: z.string().min(1),
    },
    annotations: readOnlyAnnotations,
  }, async ({ threadId }: { threadId: string }) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResult(fetchTodoayItem(snapshot.state, `thread:${threadId}`));
  });

  server.registerTool("get_note", {
    title: "Get Todoay note",
    description: "Read a note document and the dates it is linked to.",
    inputSchema: {
      noteId: z.string().min(1),
    },
    annotations: readOnlyAnnotations,
  }, async ({ noteId }: { noteId: string }) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResult(fetchTodoayItem(snapshot.state, `note:${noteId}`));
  });

  server.registerTool("list_history", {
    title: "List Todoay cloud history",
    description: "Read recent snapshot commits for audit/debugging. This does not revert anything.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().default(25),
    },
    annotations: readOnlyAnnotations,
  }, async ({ limit }: { limit?: number }) => {
    const history = await repository.listHistory(limit);
    return jsonResult({
      commits: history.map((commit) => ({
        id: commit.id,
        revision: commit.revision,
        createdAt: commit.createdAt,
        source: commit.source,
        reason: commit.reason,
        restoredFromRevision: commit.restoredFromRevision,
        taskCount: commit.taskCount,
        noteCount: commit.noteCount,
        threadCount: commit.threadCount,
      })),
    });
  });

  server.registerTool("search", {
    title: "Search Todoay",
    description: "Search tasks, notes, threads, and thread tasks. Use fetch with a returned id for full details.",
    inputSchema: {
      query: z.string().describe("Search query."),
      limit: z.number().int().min(1).max(50).optional().default(20),
    },
    annotations: readOnlyAnnotations,
  }, async ({ query, limit }: { query: string; limit?: number }) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResult({
      query,
      results: searchTodoay(snapshot.state, query, limit),
    });
  });

  server.registerTool("fetch", {
    title: "Fetch Todoay item",
    description: "Fetch a Todoay item by id. Supports ids returned by search plus overview, backlog, today, notes:index, threads:index, day:yyyy-MM-dd, task:date:id, task-reference:referenceId, note:id, thread:id, and thread-task:threadId:taskId.",
    inputSchema: {
      id: z.string().min(1),
    },
    annotations: readOnlyAnnotations,
  }, async ({ id }: { id: string }) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResult(fetchTodoayItem(snapshot.state, id));
  });

  server.registerResource("todoay-overview", "todoay://overview", {
    title: "Todoay overview",
    mimeType: "application/json",
    description: "Compact account summary, counts, current revision, and sync timestamp.",
  }, async (uri: URL) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResource(uri.href, {
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      summary: getStateSummary(snapshot.state),
    });
  });

  server.registerResource("todoay-today", "todoay://today", {
    title: "Todoay today",
    mimeType: "application/json",
    description: "Visible tasks and notes for today, including pinned items shown on today's screen.",
  }, async (uri: URL) => {
    const snapshot = await repository.loadSnapshot();
    const date = todayString();
    const noteIds = getVisibleNoteIds(snapshot.state, date);
    return jsonResource(uri.href, {
      date,
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      tasks: getVisibleTodos(snapshot.state, date),
      notes: noteIds.map((noteId) => snapshot.state.noteDocs[noteId]).filter(Boolean),
    });
  });

  server.registerResource("todoay-backlog", "todoay://backlog", {
    title: "Todoay backlog",
    mimeType: "application/json",
    description: "Open past tasks that have not been moved or copied into today/future dates.",
  }, async (uri: URL) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResource(uri.href, {
      today: todayString(),
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      groups: getBacklogGroups(snapshot.state),
    });
  });

  server.registerResource("todoay-notes-index", "todoay://notes/index", {
    title: "Todoay notes index",
    mimeType: "application/json",
    description: "Compact list of notes with titles, linked dates, timestamps, and previews.",
  }, async (uri: URL) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResource(uri.href, {
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      notes: getNoteIndex(snapshot.state),
    });
  });

  server.registerResource("todoay-threads-index", "todoay://threads/index", {
    title: "Todoay threads index",
    mimeType: "application/json",
    description: "Compact list of active threads with task counts and open-task previews.",
  }, async (uri: URL) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResource(uri.href, {
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      threads: getThreadIndex(snapshot.state),
    });
  });

  server.registerResource("todoay-debug-snapshot", "todoay://debug/snapshot", {
    title: "Todoay debug snapshot",
    mimeType: "application/json",
    description: "Full normalized Todoay snapshot. Use only for debugging or recovery-oriented inspection.",
  }, async (uri: URL) => {
    const snapshot = await repository.loadSnapshot();
    return jsonResource(uri.href, snapshot);
  });

  server.registerResource("todoay-day", new ResourceTemplate("todoay://day/{date}", {
    list: undefined,
    complete: {
      date: completeDate,
    },
  }), {
    title: "Todoay day",
    mimeType: "application/json",
    description: "Visible tasks and notes for a specific yyyy-MM-dd date.",
  }, async (uri: URL, variables: ResourceVariables) => {
    const date = String(variables.date);
    assertDate(date);
    const snapshot = await repository.loadSnapshot();
    const noteIds = getVisibleNoteIds(snapshot.state, date);
    return jsonResource(uri.href, {
      date,
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      tasks: getVisibleTodos(snapshot.state, date),
      notes: noteIds.map((noteId) => snapshot.state.noteDocs[noteId]).filter(Boolean),
    });
  });

  server.registerResource("todoay-note", new ResourceTemplate("todoay://note/{noteId}", {
    list: undefined,
    complete: {
      noteId: completeNoteId,
    },
  }), {
    title: "Todoay note",
    mimeType: "application/json",
    description: "Full note document plus the dates it is linked to.",
  }, async (uri: URL, variables: ResourceVariables) => {
    const noteId = String(variables.noteId);
    const snapshot = await repository.loadSnapshot();
    const note = snapshot.state.noteDocs[noteId];
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }
    return jsonResource(uri.href, {
      note,
      dates: getDatesForNote(snapshot.state, noteId),
    });
  });

  server.registerResource("todoay-task", new ResourceTemplate("todoay://task/{referenceId}", {
    list: undefined,
    complete: {
      referenceId: completeTaskReferenceId,
    },
  }), {
    title: "Todoay task reference",
    mimeType: "application/json",
    description: "Reverse map a conceptual task by reference id across dates and linked thread task.",
  }, async (uri: URL, variables: ResourceVariables) => {
    const referenceId = String(variables.referenceId);
    const snapshot = await repository.loadSnapshot();
    return jsonResource(uri.href, {
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      ...getTaskReferenceDetails(snapshot.state, referenceId),
    });
  });

  server.registerResource("todoay-thread", new ResourceTemplate("todoay://thread/{threadId}", {
    list: undefined,
    complete: {
      threadId: completeThreadId,
    },
  }), {
    title: "Todoay thread",
    mimeType: "application/json",
    description: "Full thread with its internal tasks and any scheduled dated todos.",
  }, async (uri: URL, variables: ResourceVariables) => {
    const threadId = String(variables.threadId);
    const snapshot = await repository.loadSnapshot();
    return jsonResource(uri.href, fetchTodoayItem(snapshot.state, `thread:${threadId}`));
  });

  return server;
};
