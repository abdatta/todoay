"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { Archive, ArchiveRestore, GripVertical, Layers, Pin, Plus } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";

type ThreadLane = "pinned" | "active" | "archived";

type DragState = {
  threadId: string;
  lane: ThreadLane;
  pointerId: number;
};

function ThreadsScreen() {
  const router = useRouter();
  const { ready, state, addThread, updateThread, reorderThread } = useTodoay();
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  const pinnedThreads = state.threads
    .filter((thread) => !thread.archived && thread.pinned)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const activeThreads = state.threads
    .filter((thread) => !thread.archived && !thread.pinned)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const archivedThreads = state.threads
    .filter((thread) => thread.archived)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));

  useEffect(() => {
    if (draftTitle !== null) {
      draftInputRef.current?.focus();
    }
  }, [draftTitle]);

  const commitDraft = () => {
    const nextTitle = draftTitle?.trim() ?? "";
    if (!nextTitle) {
      setDraftTitle(null);
      return;
    }

    const threadId = addThread(nextTitle);
    setDraftTitle(null);
    router.push(`/thread?threadId=${threadId}`);
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDraftTitle(null);
    }
  };

  const getLastUpdatedLabel = (updatedAt: string) => {
    const date = parseISO(updatedAt);
    if (isToday(date)) {
      return "Today";
    }
    if (isYesterday(date)) {
      return "Yesterday";
    }
    return date.getFullYear() === new Date().getFullYear()
      ? format(date, "MMM d")
      : format(date, "MMM d, yyyy");
  };

  const laneThreadsFor = useCallback((lane: ThreadLane) => {
    if (lane === "pinned") {
      return pinnedThreads;
    }
    if (lane === "archived") {
      return archivedThreads;
    }
    return activeThreads;
  }, [activeThreads, archivedThreads, pinnedThreads]);

  const moveDraggedThread = useCallback((clientY: number) => {
    if (!dragState) {
      return;
    }

    const laneThreads = laneThreadsFor(dragState.lane);
    if (laneThreads.length < 2) {
      return;
    }

    let closestThreadId: string | null = null;
    let closestPlacement: "before" | "after" = "before";
    let closestDistance = Number.POSITIVE_INFINITY;

    laneThreads.forEach((candidate) => {
      const element = rowRefs.current[candidate.id];
      if (!element || candidate.id === dragState.threadId) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const distance = Math.abs(clientY - midpoint);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestThreadId = candidate.id;
        closestPlacement = clientY < midpoint ? "before" : "after";
      }
    });

    if (closestThreadId) {
      reorderThread(dragState.threadId, closestThreadId, closestPlacement);
    }
  }, [dragState, laneThreadsFor, reorderThread]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId === dragState.pointerId) {
        moveDraggedThread(event.clientY);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId === dragState.pointerId) {
        setDragState(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragState, moveDraggedThread]);

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  const beginDrag = (threadId: string, lane: ThreadLane, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ threadId, lane, pointerId: event.pointerId });
  };

  const renderThreadRow = (threadId: string, lane: ThreadLane) => {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      return null;
    }

    const openTaskCount = thread.tasks.filter((task) => !task.completed && task.text.trim() !== "").length;
    const isDragging = dragState?.threadId === thread.id;

    return (
      <article
        key={thread.id}
        className={`thread-list-row${isDragging ? " dragging" : ""}`}
        ref={(element) => {
          rowRefs.current[thread.id] = element;
        }}
      >
        <Link href={`/thread?threadId=${thread.id}`} className="thread-list-link">
          <span className="thread-list-title">{thread.title || "Untitled thread"}</span>
          <span className="thread-list-meta">
            {openTaskCount} open {openTaskCount === 1 ? "task" : "tasks"} · Last updated {getLastUpdatedLabel(thread.updatedAt)}
          </span>
        </Link>
        <div className="thread-list-actions">
          {!thread.archived ? (
            <button
              type="button"
              className={`btn-icon thread-list-action${thread.pinned ? " active" : ""}`}
              aria-label={thread.pinned ? "Unpin thread" : "Pin thread"}
              title={thread.pinned ? "Unpin thread" : "Pin thread"}
              onClick={() => updateThread(thread.id, { pinned: !thread.pinned })}
            >
              <Pin size={17} />
            </button>
          ) : null}
          <button
            type="button"
            className="btn-icon thread-list-action"
            aria-label={thread.archived ? "Restore thread" : "Archive thread"}
            title={thread.archived ? "Restore thread" : "Archive thread"}
            onClick={() => updateThread(thread.id, { archived: !thread.archived })}
          >
            {thread.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
          </button>
          <button
            type="button"
            className="thread-drag-handle"
            aria-label={`Reorder ${thread.title || "thread"}`}
            title="Drag to reorder"
            onPointerDown={(event) => beginDrag(thread.id, lane, event)}
          >
            <GripVertical size={16} />
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="app-shell">
      <PageHeader
        title="Threads"
        icon={<Layers size={30} color="var(--accent-color)" />}
      />

      <div className="thread-create-row">
        <button
          type="button"
          className="thread-create-button"
          aria-label="Create new thread"
          onClick={() => setDraftTitle((current) => current ?? "")}
        >
          <Plus size={16} />
          <span>New</span>
        </button>
      </div>

      <section className="card thread-index-card">
        {pinnedThreads.length > 0 ? (
          <>
            <div className="thread-lane-divider">
              <span>Pinned</span>
            </div>
            <div className="thread-section-list">
              {pinnedThreads.map((thread) => renderThreadRow(thread.id, "pinned"))}
            </div>
          </>
        ) : null}

        {pinnedThreads.length > 0 ? (
          <div className="thread-lane-divider">
            <span>Active</span>
          </div>
        ) : null}

        <div className="thread-section-list">
          {draftTitle !== null ? (
            <article className="thread-list-row thread-draft-row">
              <div className="thread-list-link">
                <input
                  ref={draftInputRef}
                  className="thread-draft-input"
                  value={draftTitle}
                  placeholder="Thread title"
                  aria-label="New thread title"
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={handleDraftKeyDown}
                />
                <span className="thread-list-meta">0 open tasks</span>
              </div>
            </article>
          ) : null}

          {activeThreads.length === 0 && draftTitle === null ? (
            <div className="empty-state thread-empty-state">No active threads yet.</div>
          ) : (
            activeThreads.map((thread) => renderThreadRow(thread.id, "active"))
          )}
        </div>

        {archivedThreads.length > 0 ? (
          <>
            <div className="thread-archive-divider">
              <span>Archived</span>
            </div>
            <div className="thread-section-list">
              {archivedThreads.map((thread) => renderThreadRow(thread.id, "archived"))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

export default function ThreadsPage() {
  return (
    <ClientReady>
      <ThreadsScreen />
    </ClientReady>
  );
}
