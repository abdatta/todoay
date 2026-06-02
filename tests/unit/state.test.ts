import { describe, expect, it } from "vitest";
import { applyRevertPatch } from "@/lib/store";
import {
  createInitialState,
  createMutationStamp,
  mergeTodoayStates,
  normalizeState,
} from "@/lib/sync";
import type { ThreadRecord, ThreadTaskItem, TodoItem, TodoayState } from "@/lib/types";

const stamp = (at: string, id: string) => createMutationStamp(at, id);

const todo = (patch: Partial<TodoItem> & Pick<TodoItem, "id" | "text" | "sourceDate">): TodoItem => ({
  id: patch.id,
  referenceId: patch.referenceId ?? patch.id,
  text: patch.text,
  completed: patch.completed ?? false,
  pinned: patch.pinned ?? false,
  createdAt: patch.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-01-01T00:00:00.000Z",
  mutationId: patch.mutationId ?? `mutation:${patch.id}`,
  sortOrder: patch.sortOrder ?? 1024,
  sourceDate: patch.sourceDate,
  copiedFromDate: patch.copiedFromDate,
  durationMinutes: patch.durationMinutes,
  threadId: patch.threadId,
  threadTaskId: patch.threadTaskId,
});

const threadTask = (
  patch: Partial<ThreadTaskItem> & Pick<ThreadTaskItem, "id" | "text">,
): ThreadTaskItem => ({
  id: patch.id,
  referenceId: patch.referenceId ?? patch.id,
  text: patch.text,
  completed: patch.completed ?? false,
  completedAt: patch.completedAt,
  createdAt: patch.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-01-01T00:00:00.000Z",
  mutationId: patch.mutationId ?? `mutation:${patch.id}`,
  sortOrder: patch.sortOrder ?? 1024,
  durationMinutes: patch.durationMinutes,
});

const thread = (patch: Partial<ThreadRecord> & Pick<ThreadRecord, "id" | "title">): ThreadRecord => ({
  id: patch.id,
  title: patch.title,
  pinned: patch.pinned ?? false,
  archived: patch.archived ?? false,
  createdAt: patch.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-01-01T00:00:00.000Z",
  mutationId: patch.mutationId ?? `mutation:${patch.id}`,
  sortOrder: patch.sortOrder ?? 1024,
  tasks: patch.tasks ?? [],
});

describe("normalizeState", () => {
  it("upgrades sparse stored state and removes invalid note links", () => {
    const state = normalizeState({
      todosByDate: {
        "2026-05-30": [
          { id: "later", text: "Later", sourceDate: "2026-05-30", sortOrder: 2048 },
          { id: "first", text: "First", sourceDate: "2026-05-30", sortOrder: 1024 },
        ],
      },
      noteDocs: {
        note1: {
          id: "note1",
          title: "Daily note",
          content: "Keep this",
          pinned: true,
          createdAt: "2026-05-30T08:00:00.000Z",
          updatedAt: "2026-05-30T08:00:00.000Z",
          mutationId: "note:1",
        },
      },
      noteIdsByDate: {
        "2026-05-30": ["missing", "note1", "note1"],
      },
    });

    expect(state.syncMetadata.schemaVersion).toBe(3);
    expect(state.todosByDate["2026-05-30"].map((item) => item.id)).toEqual(["first", "later"]);
    expect(state.todosByDate["2026-05-30"][0]).toMatchObject({
      completed: false,
      pinned: false,
      referenceId: "first",
    });
    expect(state.noteIdsByDate["2026-05-30"]).toEqual(["note1"]);
    expect(state.syncMetadata.noteLinkMetadata["2026-05-30"].note1).toBeDefined();
  });
});

describe("mergeTodoayStates", () => {
  it("keeps linked task references converged and lets newer tombstones win", () => {
    const local = normalizeState({
      todosByDate: {
        "2026-05-30": [
          todo({
            id: "task-old",
            referenceId: "shared-task",
            text: "Water plants",
            sourceDate: "2026-05-30",
            updatedAt: "2026-05-30T09:00:00.000Z",
            mutationId: "local:1",
          }),
        ],
      },
    });
    const remote = normalizeState({
      todosByDate: {
        "2026-05-30": [
          todo({
            id: "task-old",
            referenceId: "shared-task",
            text: "Water balcony plants",
            sourceDate: "2026-05-30",
            updatedAt: "2026-05-30T10:00:00.000Z",
            mutationId: "remote:1",
          }),
        ],
      },
      syncMetadata: {
        ...createInitialState().syncMetadata,
        todoTombstones: {
          deleted: {
            deletedAt: "2026-05-30T11:00:00.000Z",
            mutationId: "remote:delete",
          },
        },
      },
    });
    local.todosByDate["2026-05-29"] = [
      todo({
        id: "deleted",
        text: "Do not resurrect",
        sourceDate: "2026-05-29",
        updatedAt: "2026-05-30T08:00:00.000Z",
        mutationId: "local:deleted",
      }),
    ];

    const merged = mergeTodoayStates(local, remote);

    expect(merged.todosByDate["2026-05-30"][0].text).toBe("Water balcony plants");
    expect(Object.values(merged.todosByDate).flat().some((item) => item.id === "deleted")).toBe(false);
    expect(merged.syncMetadata.todoTombstones.deleted).toEqual({
      deletedAt: "2026-05-30T11:00:00.000Z",
      mutationId: "remote:delete",
    });
  });

  it("merges thread task deletions without deleting the parent thread", () => {
    const local = normalizeState({
      threads: [
        thread({
          id: "thread1",
          title: "Launch",
          tasks: [threadTask({ id: "task1", text: "Draft" })],
        }),
      ],
    });
    const remote = normalizeState({
      threads: [thread({ id: "thread1", title: "Launch", tasks: [] })],
      syncMetadata: {
        ...createInitialState().syncMetadata,
        threadTaskTombstones: {
          task1: {
            deletedAt: "2026-05-31T00:00:00.000Z",
            mutationId: "remote:delete-task",
          },
        },
      },
    });

    const merged = mergeTodoayStates(local, remote);

    expect(merged.threads).toHaveLength(1);
    expect(merged.threads[0].tasks).toEqual([]);
    expect(merged.syncMetadata.threadTaskTombstones.task1).toBeDefined();
  });
});

describe("applyRevertPatch", () => {
  const revertStamp = stamp("2026-06-01T00:00:00.000Z", "revert:1");

  it("reverts only the selected change while preserving unrelated newer work", () => {
    const previous = normalizeState({
      todosByDate: {
        "2026-05-30": [todo({ id: "task1", text: "Original", sourceDate: "2026-05-30" })],
      },
    });
    const selected = normalizeState({
      todosByDate: {
        "2026-05-30": [
          todo({
            id: "task1",
            text: "Changed",
            sourceDate: "2026-05-30",
            updatedAt: "2026-05-30T01:00:00.000Z",
            mutationId: "selected:1",
          }),
        ],
      },
    });
    const current = normalizeState({
      todosByDate: {
        "2026-05-30": selected.todosByDate["2026-05-30"],
        "2026-06-01": [todo({ id: "newer", text: "Newer task", sourceDate: "2026-06-01" })],
      },
      threads: [thread({ id: "new-thread", title: "Newer thread" })],
    });

    const reverted = applyRevertPatch(current, selected, previous, revertStamp);

    expect(reverted.todosByDate["2026-05-30"][0]).toMatchObject({
      id: "task1",
      text: "Original",
      updatedAt: revertStamp.updatedAt,
      mutationId: revertStamp.mutationId,
    });
    expect(reverted.todosByDate["2026-06-01"][0].text).toBe("Newer task");
    expect(reverted.threads[0].title).toBe("Newer thread");
  });

  it("rejects a revert when the selected item changed after that history entry", () => {
    const previous = normalizeState({
      todosByDate: {
        "2026-05-30": [todo({ id: "task1", text: "Original", sourceDate: "2026-05-30" })],
      },
    });
    const selected = normalizeState({
      todosByDate: {
        "2026-05-30": [todo({ id: "task1", text: "Changed", sourceDate: "2026-05-30" })],
      },
    });
    const current: TodoayState = normalizeState({
      todosByDate: {
        "2026-05-30": [todo({ id: "task1", text: "Changed again", sourceDate: "2026-05-30" })],
      },
    });

    expect(() => applyRevertPatch(current, selected, previous, revertStamp)).toThrow(
      /changed after this history entry/,
    );
  });
});
