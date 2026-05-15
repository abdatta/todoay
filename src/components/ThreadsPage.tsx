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
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Layers, Pin, Plus } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";
import type { ThreadRecord } from "@/lib/types";

type ThreadLane = "pinned" | "active" | "inactive" | "archived";
type ThreadSection = {
  lane: ThreadLane;
  label: string;
  threads: ThreadRecord[];
  hasDraft?: boolean;
  collapsible?: boolean;
};

type DragState = {
  threadId: string;
  lane: ThreadLane;
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  originLeft: number;
  originTop: number;
  width: number;
  height: number;
  boundsLeft: number;
  boundsTop: number;
  boundsWidth: number;
  boundsHeight: number;
};

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 8;

const getOpenThreadTaskCount = (thread: ThreadRecord) =>
  thread.tasks.filter((task) => !task.completed && task.text.trim() !== "").length;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function ThreadsScreen() {
  const router = useRouter();
  const { ready, state, addThread, updateThread, reorderThread } = useTodoay();
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const laneRefs = useRef<Record<ThreadLane, HTMLDivElement | null>>({
    pinned: null,
    active: null,
    inactive: null,
    archived: null,
  });
  const threadCardRef = useRef<HTMLElement | null>(null);
  const longPressRef = useRef<{ threadId: string; lane: ThreadLane; pointerId: number; timeoutId: number | null; startX: number; startY: number } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const scrollLockCleanupRef = useRef<(() => void) | null>(null);

  const pinnedThreads = state.threads
    .filter((thread) => !thread.archived && thread.pinned)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const activeThreads = state.threads
    .filter((thread) => !thread.archived && !thread.pinned && getOpenThreadTaskCount(thread) > 0)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const inactiveThreads = state.threads
    .filter((thread) => !thread.archived && !thread.pinned && getOpenThreadTaskCount(thread) === 0)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const archivedThreads = state.threads
    .filter((thread) => thread.archived)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));

  useEffect(() => {
    if (draftTitle !== null) {
      draftInputRef.current?.focus();
    }
  }, [draftTitle]);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current?.timeoutId) {
      window.clearTimeout(longPressRef.current.timeoutId);
    }
    longPressRef.current = null;
  }, []);

  const lockDragScroll = useCallback(() => {
    if (scrollLockCleanupRef.current) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const touchMoveOptions: AddEventListenerOptions = { passive: false };
    const preventTouchScroll = (event: TouchEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("touchmove", preventTouchScroll, touchMoveOptions);
    scrollLockCleanupRef.current = () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("touchmove", preventTouchScroll, touchMoveOptions);
    };
  }, []);

  const unlockDragScroll = useCallback(() => {
    scrollLockCleanupRef.current?.();
    scrollLockCleanupRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearLongPress();
      unlockDragScroll();
    };
  }, [clearLongPress, unlockDragScroll]);

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
    if (lane === "inactive") {
      return inactiveThreads;
    }
    return activeThreads;
  }, [activeThreads, archivedThreads, inactiveThreads, pinnedThreads]);

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
        if (event.cancelable) {
          event.preventDefault();
        }
        setDragState((current) =>
          current && current.pointerId === event.pointerId
            ? { ...current, currentX: event.clientX, currentY: event.clientY }
            : current,
        );
        moveDraggedThread(event.clientY);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId === dragState.pointerId) {
        suppressClickRef.current = dragState.threadId;
        setDragState(null);
        unlockDragScroll();
      }
      clearLongPress();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [clearLongPress, dragState, moveDraggedThread, unlockDragScroll]);

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  const beginLongPress = (threadId: string, lane: ThreadLane, event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, input, textarea, select")
    ) {
      return;
    }

    clearLongPress();
    const dragTarget = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    longPressRef.current = {
      threadId,
      lane,
      pointerId,
      startX,
      startY,
      timeoutId: window.setTimeout(() => {
        try {
          if (dragTarget.isConnected) {
            dragTarget.setPointerCapture(pointerId);
          }
        } catch {
          return;
        }

        lockDragScroll();

        const rowRect = rowRefs.current[threadId]?.getBoundingClientRect();
        const cardRect = threadCardRef.current?.getBoundingClientRect();
        const laneRect = laneRefs.current[lane]?.getBoundingClientRect();

        setDragState({
          threadId,
          lane,
          pointerId,
          startX,
          startY,
          currentX: startX,
          currentY: startY,
          originLeft: (rowRect?.left ?? 0) - (cardRect?.left ?? 0),
          originTop: (rowRect?.top ?? 0) - (cardRect?.top ?? 0),
          width: rowRect?.width ?? 0,
          height: rowRect?.height ?? 72,
          boundsLeft: ((laneRect?.left ?? cardRect?.left) ?? 0) - (cardRect?.left ?? 0),
          boundsTop: ((laneRect?.top ?? cardRect?.top) ?? 0) - (cardRect?.top ?? 0),
          boundsWidth: laneRect?.width ?? cardRect?.width ?? 0,
          boundsHeight: laneRect?.height ?? cardRect?.height ?? 0,
        });
        suppressClickRef.current = threadId;
      }, LONG_PRESS_MS),
    };
  };

  const updateLongPress = (threadId: string, event: ReactPointerEvent<HTMLElement>) => {
    const pendingLongPress = longPressRef.current;

    if (!pendingLongPress || pendingLongPress.threadId !== threadId || pendingLongPress.pointerId !== event.pointerId) {
      return;
    }

    if (
      Math.abs(event.clientX - pendingLongPress.startX) > LONG_PRESS_MOVE_TOLERANCE ||
      Math.abs(event.clientY - pendingLongPress.startY) > LONG_PRESS_MOVE_TOLERANCE
    ) {
      clearLongPress();
    }
  };

  const renderThreadRow = (threadId: string, lane: ThreadLane, renderAsOverlay = false) => {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      return null;
    }

    const openTaskCount = getOpenThreadTaskCount(thread);
    const hasNoOpenTasks = openTaskCount === 0;
    const isDragging = dragState?.threadId === thread.id;
    const isPlaceholder = isDragging && !renderAsOverlay;

    return (
      <article
        key={thread.id}
        className={`thread-list-row${lane === "inactive" ? " inactive" : ""}${lane === "archived" ? " archived" : ""}${hasNoOpenTasks ? " empty" : ""}${isDragging ? " dragging" : ""}${isPlaceholder ? " dragging-placeholder" : ""}`}
        style={
          isPlaceholder
            ? {
                height: `${dragState.height}px`,
              }
            : undefined
        }
        ref={(element) => {
          if (!renderAsOverlay) {
            rowRefs.current[thread.id] = element;
          }
        }}
        onPointerDown={renderAsOverlay ? undefined : (event) => beginLongPress(thread.id, lane, event)}
        onPointerMove={renderAsOverlay ? undefined : (event) => updateLongPress(thread.id, event)}
        onPointerUp={renderAsOverlay ? undefined : clearLongPress}
        onPointerCancel={renderAsOverlay ? undefined : clearLongPress}
        onContextMenuCapture={
          renderAsOverlay
            ? undefined
            : (event) => {
                if (
                  event.target instanceof HTMLElement &&
                  event.target.closest("button, input, textarea, select")
                ) {
                  return;
                }

                if (longPressRef.current?.threadId === thread.id || dragState?.threadId === thread.id) {
                  event.preventDefault();
                }
              }
        }
        onClickCapture={
          renderAsOverlay
            ? undefined
            : (event) => {
                if (suppressClickRef.current === thread.id) {
                  event.preventDefault();
                  event.stopPropagation();
                  suppressClickRef.current = null;
                }
              }
        }
      >
        <Link
          href={`/thread?threadId=${thread.id}`}
          className="thread-list-link"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        >
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
        </div>
      </article>
    );
  };

  const draggedThread = dragState
    ? state.threads.find((thread) => thread.id === dragState.threadId) ?? null
    : null;
  const dragOffsetX = dragState
    ? clamp(
        dragState.currentX - dragState.startX,
        dragState.boundsLeft - dragState.originLeft,
        dragState.boundsLeft + Math.max(0, dragState.boundsWidth - dragState.width) - dragState.originLeft,
      )
    : 0;
  const dragOffsetY = dragState
    ? clamp(
        dragState.currentY - dragState.startY,
        dragState.boundsTop - dragState.originTop,
        dragState.boundsTop + Math.max(0, dragState.boundsHeight - dragState.height) - dragState.originTop,
      )
    : 0;
  const allSections: ThreadSection[] = [
    { lane: "pinned", label: "Pinned", threads: pinnedThreads },
    { lane: "active", label: "Active", threads: activeThreads, hasDraft: draftTitle !== null },
    { lane: "inactive", label: "Inactive", threads: inactiveThreads },
    { lane: "archived", label: "Archived", threads: archivedThreads, collapsible: true },
  ];
  const sections = allSections.filter((section) => section.threads.length > 0 || section.hasDraft);
  const firstSectionLane = sections[0]?.lane ?? null;
  const hasVisibleContent = sections.length > 0;

  const renderSectionHeader = (section: (typeof sections)[number]) => {
    if (section.lane === firstSectionLane && !section.collapsible) {
      return null;
    }

    if (section.collapsible) {
      const ArchiveIcon = isArchiveExpanded ? ChevronDown : ChevronRight;
      return (
        <button
          type="button"
          className="thread-archive-divider"
          aria-expanded={isArchiveExpanded}
          onClick={() => setIsArchiveExpanded((current) => !current)}
        >
          <span>
            <ArchiveIcon size={15} />
            {section.label}
          </span>
        </button>
      );
    }

    return (
      <div className="thread-lane-divider">
        <span>{section.label}</span>
      </div>
    );
  };

  const renderSection = (section: (typeof sections)[number]) => {
    const isArchivedCollapsed = section.lane === "archived" && !isArchiveExpanded;

    return (
      <div key={section.lane}>
        {renderSectionHeader(section)}
        {isArchivedCollapsed ? null : (
          <div
            className="thread-section-list"
            ref={(element) => {
              laneRefs.current[section.lane] = element;
            }}
          >
            {section.hasDraft ? (
              <article className="thread-list-row thread-draft-row">
                <div className="thread-list-link">
                  <input
                    ref={draftInputRef}
                    className="thread-draft-input"
                    value={draftTitle ?? ""}
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

            {section.threads.map((thread) => renderThreadRow(thread.id, section.lane))}
          </div>
        )}
      </div>
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

      <section className="card thread-index-card" ref={threadCardRef}>
        {hasVisibleContent ? (
          sections.map(renderSection)
        ) : (
          <div className="empty-state thread-empty-state">No threads yet.</div>
        )}
        {dragState && draggedThread ? (
          <div
            className="thread-drag-overlay"
            style={{
              left: `${dragState.originLeft}px`,
              top: `${dragState.originTop}px`,
              width: `${dragState.width}px`,
              minHeight: `${dragState.height}px`,
              transform: `translate(${dragOffsetX}px, ${dragOffsetY}px) scale(1.02)`,
            }}
          >
            {renderThreadRow(draggedThread.id, dragState.lane, true)}
          </div>
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
