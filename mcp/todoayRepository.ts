import { createClient } from "@supabase/supabase-js";
import { createInitialState, normalizeState } from "../src/lib/sync.ts";
import type { SnapshotCommitSource, TodoaySnapshotCommit, TodoayState } from "../src/lib/types.ts";

const SNAPSHOT_TABLE = "todoay_snapshots";
const SNAPSHOT_COMMIT_TABLE = "todoay_snapshot_commits";

export type TodoaySnapshot = {
  state: TodoayState;
  revision: number;
  updatedAt: string | null;
};

export type TodoayRepository = {
  loadSnapshot: () => Promise<TodoaySnapshot>;
  listHistory: (limit?: number) => Promise<TodoaySnapshotCommit[]>;
};

type RefreshingRepositoryOptions = {
  accessToken?: string;
  refreshToken: string;
};

type SnapshotRecord = {
  state: TodoayState | null;
  revision: number | null;
  updated_at: string | null;
};

type SnapshotCommitRecord = {
  id: string;
  revision: number;
  state?: TodoayState | null;
  source: Partial<SnapshotCommitSource> | null;
  reason: "sync" | "restore" | "revert";
  restored_from_revision: number | null;
  task_count: number;
  note_count: number;
  thread_count: number;
  created_at: string;
};

const readEnv = (name: string) => {
  const denoLike = globalThis as typeof globalThis & {
    Deno?: {
      env?: {
        get?: (key: string) => string | undefined;
      };
    };
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  return denoLike.Deno?.env?.get?.(name) ?? denoLike.process?.env?.[name];
};

const requiredEnv = (...names: string[]) => {
  const value = names.map(readEnv).find(Boolean);
  if (!value) {
    throw new Error(`Missing ${names.join(" or ")}.`);
  }
  return value;
};

export const readSupabaseConfig = () => ({
  url: requiredEnv("TODOAY_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
  anonKey: requiredEnv("TODOAY_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"),
});

const createAccessTokenClient = (accessToken: string) => {
  if (!accessToken) {
    throw new Error("Missing Supabase access token.");
  }

  const { url, anonKey } = readSupabaseConfig();
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
};

const createAuthClient = () => {
  const { url, anonKey } = readSupabaseConfig();
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export const verifySupabaseAccessToken = async (accessToken: string) => {
  const client = createAccessTokenClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error(error?.message ?? "Invalid Supabase access token.");
  }
};

const normalizeCommitSource = (source: Partial<SnapshotCommitSource> | null): SnapshotCommitSource => ({
  kind: source?.kind ?? "device",
  id: source?.id ?? "unknown",
  label: source?.label ?? "Unknown source",
});

const toSnapshotCommit = (record: SnapshotCommitRecord): TodoaySnapshotCommit => ({
  id: record.id,
  revision: Number(record.revision),
  createdAt: record.created_at,
  state: normalizeState(record.state ?? undefined),
  source: normalizeCommitSource(record.source),
  reason: record.reason,
  restoredFromRevision:
    record.restored_from_revision === null ? null : Number(record.restored_from_revision),
  taskCount: Number(record.task_count),
  noteCount: Number(record.note_count),
  threadCount: Number(record.thread_count),
});

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
};

const isAccessTokenExpiring = (accessToken: string, leewaySeconds = 60) => {
  try {
    const payload = JSON.parse(decodeBase64Url(accessToken.split(".")[1] ?? "")) as { exp?: number };

    return typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000) + leewaySeconds;
  } catch {
    return true;
  }
};

const createTokenProviderRepository = (getAccessToken: () => Promise<string>): TodoayRepository => ({
  async loadSnapshot() {
    const client = createAccessTokenClient(await getAccessToken());
    const { data, error } = await client
      .from(SNAPSHOT_TABLE)
      .select("state, revision, updated_at")
      .maybeSingle<SnapshotRecord>();

    if (error) {
      throw new Error(`Failed to load Todoay snapshot: ${error.message}`);
    }

    return {
      state: normalizeState(data?.state ?? createInitialState()),
      revision: Number(data?.revision ?? 0),
      updatedAt: data?.updated_at ?? null,
    };
  },

  async listHistory(limit = 25) {
    const client = createAccessTokenClient(await getAccessToken());
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
    const { data, error } = await client
      .from(SNAPSHOT_COMMIT_TABLE)
      .select("id, revision, state, source, reason, restored_from_revision, task_count, note_count, thread_count, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit)
      .returns<SnapshotCommitRecord[]>();

    if (error) {
      throw new Error(`Failed to load Todoay history: ${error.message}`);
    }

    return (data ?? []).map(toSnapshotCommit);
  },
});

export const createSupabaseTodoayRepository = (accessToken: string): TodoayRepository =>
  createTokenProviderRepository(async () => accessToken);

export const createRefreshingSupabaseTodoayRepository = ({
  accessToken,
  refreshToken,
}: RefreshingRepositoryOptions): TodoayRepository => {
  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;
  let refreshPromise: Promise<string> | null = null;

  const refreshAccessToken = async () => {
    if (currentAccessToken && !isAccessTokenExpiring(currentAccessToken)) {
      return currentAccessToken;
    }

    refreshPromise ??= (async () => {
      const client = createAuthClient();
      const { data, error } = await client.auth.refreshSession({
        refresh_token: currentRefreshToken,
      });

      if (error || !data.session?.access_token) {
        throw new Error(`Failed to refresh Supabase session: ${error?.message ?? "No session returned."}`);
      }

      currentAccessToken = data.session.access_token;
      currentRefreshToken = data.session.refresh_token ?? currentRefreshToken;
      return currentAccessToken;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  };

  return createTokenProviderRepository(refreshAccessToken);
};

export const createEnvTodoayRepository = () => {
  const accessToken = readEnv("TODOAY_SUPABASE_ACCESS_TOKEN");
  const refreshToken = readEnv("TODOAY_SUPABASE_REFRESH_TOKEN");

  if (refreshToken) {
    return createRefreshingSupabaseTodoayRepository({
      accessToken,
      refreshToken,
    });
  }

  return createSupabaseTodoayRepository(requiredEnv("TODOAY_SUPABASE_ACCESS_TOKEN"));
};
