import type { Page } from "@playwright/test";

type Todo = {
  id: string;
  referenceId: string;
  text: string;
  completed: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  mutationId: string;
  sortOrder: number;
  sourceDate: string;
  durationMinutes?: number;
  copiedFromDate?: string;
  threadId?: string;
  threadTaskId?: string;
};

type ThreadTask = {
  id: string;
  referenceId: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  mutationId: string;
  sortOrder: number;
  completedAt?: string;
  durationMinutes?: number;
};

type Thread = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  mutationId: string;
  sortOrder: number;
  tasks: ThreadTask[];
};

type SeedState = {
  todosByDate?: Record<string, Todo[]>;
  noteIdsByDate?: Record<string, string[]>;
  noteDocs?: Record<string, unknown>;
  threads?: Thread[];
  themeMode?: "dark" | "light" | "system";
  copyToBehavior?: "reference" | "value";
};

const STORAGE_KEY = "todoay-state-v2";
const SEED_MARKER_KEY = "todoay-e2e-seeded";

export const dateKey = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const addMonths = (date: string, offsetMonths: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(year, month - 1 + offsetMonths, day);
  const nextYear = nextDate.getFullYear();
  const nextMonth = String(nextDate.getMonth() + 1).padStart(2, "0");
  const nextDay = String(nextDate.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
};

export const dayOfMonth = (date: string) => String(Number(date.slice(8, 10)));

export const monthLabel = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
};

export const seedTodo = (patch: Partial<Todo> & Pick<Todo, "id" | "text" | "sourceDate">): Todo => ({
  id: patch.id,
  referenceId: patch.referenceId ?? patch.id,
  text: patch.text,
  completed: patch.completed ?? false,
  pinned: patch.pinned ?? false,
  createdAt: patch.createdAt ?? "2026-05-30T08:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-30T08:00:00.000Z",
  mutationId: patch.mutationId ?? `seed:${patch.id}`,
  sortOrder: patch.sortOrder ?? 1024,
  sourceDate: patch.sourceDate,
  durationMinutes: patch.durationMinutes,
  copiedFromDate: patch.copiedFromDate,
  threadId: patch.threadId,
  threadTaskId: patch.threadTaskId,
});

export const seedThreadTask = (
  patch: Partial<ThreadTask> & Pick<ThreadTask, "id" | "text">,
): ThreadTask => ({
  id: patch.id,
  referenceId: patch.referenceId ?? patch.id,
  text: patch.text,
  completed: patch.completed ?? false,
  completedAt: patch.completedAt,
  createdAt: patch.createdAt ?? "2026-05-30T08:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-30T08:00:00.000Z",
  mutationId: patch.mutationId ?? `seed:${patch.id}`,
  sortOrder: patch.sortOrder ?? 1024,
  durationMinutes: patch.durationMinutes,
});

export const seedThread = (patch: Partial<Thread> & Pick<Thread, "id" | "title">): Thread => ({
  id: patch.id,
  title: patch.title,
  pinned: patch.pinned ?? false,
  archived: patch.archived ?? false,
  createdAt: patch.createdAt ?? "2026-05-30T08:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-30T08:00:00.000Z",
  mutationId: patch.mutationId ?? `seed:${patch.id}`,
  sortOrder: patch.sortOrder ?? 1024,
  tasks: patch.tasks ?? [],
});

export const seedNote = (patch: {
  id: string;
  title?: string;
  content?: string;
  pinned?: boolean;
}) => ({
  id: patch.id,
  title: patch.title ?? "Untitled note",
  content: patch.content ?? "",
  pinned: patch.pinned ?? false,
  createdAt: "2026-05-30T08:00:00.000Z",
  updatedAt: "2026-05-30T08:00:00.000Z",
  mutationId: `seed:${patch.id}`,
});

export async function seedState(page: Page, state: SeedState = {}) {
  await page.addInitScript(
    ({ markerKey, storageKey, value }) => {
      if (window.sessionStorage.getItem(markerKey)) {
        return;
      }

      window.localStorage.clear();
      window.localStorage.setItem(storageKey, JSON.stringify(value));
      window.sessionStorage.setItem(markerKey, "true");
    },
    {
      markerKey: SEED_MARKER_KEY,
      storageKey: STORAGE_KEY,
      value: {
        todosByDate: state.todosByDate ?? {},
        noteIdsByDate: state.noteIdsByDate ?? {},
        noteDocs: state.noteDocs ?? {},
        threads: state.threads ?? [],
        themeMode: state.themeMode ?? "system",
        copyToBehavior: state.copyToBehavior ?? "reference",
      },
    },
  );
}

export async function getStoredState(page: Page) {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}"), STORAGE_KEY);
}
