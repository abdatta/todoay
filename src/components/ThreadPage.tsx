"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  CalendarClock,
  ChevronLeft,
  Layers,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import ClientReady from "@/components/ClientReady";
import { DatePickerPopupContent } from "@/components/CustomDatePicker";
import PageHeader from "@/components/PageHeader";
import { TaskLine, useTaskLineReorder, type TaskLineFocusRequest } from "@/components/TaskLine";
import type { ThreadTaskItem } from "@/lib/types";
import { useTodoay } from "@/lib/store";

function ThreadScreen({ threadId }: { threadId: string }) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");
  const {
    ready,
    state,
    updateThread,
    deleteThread,
    addThreadTask,
    updateThreadTask,
    deleteThreadTask,
    reorderThreadTask,
    scheduleThreadTaskToDate,
  } = useTodoay();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openScheduleMenuId, setOpenScheduleMenuId] = useState<string | null>(null);
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const [editingDurationTaskId, setEditingDurationTaskId] = useState<string | null>(null);
  const [isThreadActionMenuOpen, setIsThreadActionMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [menuViewDate, setMenuViewDate] = useState<Date>(parseISO(today));
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scheduleMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const threadActionMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<TaskLineFocusRequest | null>(null);

  const thread = state.threads.find((candidate) => candidate.id === threadId) ?? null;
  const openTasks = useMemo(() => thread?.tasks.filter((task) => !task.completed) ?? [], [thread]);
  const completedTasks = useMemo(() => thread?.tasks.filter((task) => task.completed) ?? [], [thread]);

  const scheduledDatesByReferenceId = useMemo(() => {
    const dates = new Map<string, string[]>();
    Object.entries(state.todosByDate).forEach(([date, todos]) => {
      todos.forEach((todo) => {
        if (!todo.threadId || todo.threadId !== threadId) {
          return;
        }

        const current = dates.get(todo.referenceId) ?? [];
        if (!current.includes(date)) {
          dates.set(todo.referenceId, [...current, date].sort((left, right) => left.localeCompare(right)));
        }
      });
    });
    return dates;
  }, [state.todosByDate, threadId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (openMenuId) {
        const currentMenu = menuRefs.current[openMenuId];
        if (currentMenu && event.target instanceof Node && !currentMenu.contains(event.target)) {
          setOpenMenuId(null);
        }
      }

      if (openScheduleMenuId) {
        const currentScheduleMenu = scheduleMenuRefs.current[openScheduleMenuId];
        if (currentScheduleMenu && event.target instanceof Node && !currentScheduleMenu.contains(event.target)) {
          setOpenScheduleMenuId(null);
        }
      }

      if (
        isThreadActionMenuOpen &&
        threadActionMenuRef.current &&
        event.target instanceof Node &&
        !threadActionMenuRef.current.contains(event.target)
      ) {
        setIsThreadActionMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setOpenScheduleMenuId(null);
        setScheduleTaskId(null);
        setIsThreadActionMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isThreadActionMenuOpen, openMenuId, openScheduleMenuId]);

  const handleReorderThreadTask = useCallback((taskId: string, targetTaskId: string, placement: "before" | "after") => {
    if (!thread) {
      return;
    }

    reorderThreadTask(thread.id, taskId, targetTaskId, placement);
  }, [reorderThreadTask, thread]);

  const {
    cardRef: taskListCardRef,
    completedItemsRef,
    consumeSuppressedClick,
    dragOverlayStyle,
    dragState,
    getDragHandleProps,
    openItemsRef,
    rowRefs,
  } = useTaskLineReorder({
    openItems: openTasks,
    completedItems: completedTasks,
    onReorder: handleReorderThreadTask,
    onBeforeDragStart: () => {
      setOpenMenuId(null);
      setOpenScheduleMenuId(null);
    },
  });

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  if (!thread) {
    return (
      <div className="app-shell">
        <PageHeader title="Thread not found" icon={<Layers size={30} color="var(--accent-color)" />} />
        <section className="card">
          <div className="empty-state">This thread is no longer available.</div>
        </section>
      </div>
    );
  }

  const isReadOnly = thread.archived;
  const scheduleTask = scheduleTaskId
    ? thread.tasks.find((task) => task.id === scheduleTaskId) ?? null
    : null;
  const titleValue = titleDraft ?? thread.title;
  const titleWidthCh = Math.min(34, Math.max(10, titleValue.length + 5));

  const commitTitleDraft = () => {
    if (!isEditingTitle) {
      setTitleDraft(null);
      return;
    }

    const nextTitle = (titleDraft ?? thread.title).trim();
    if (!nextTitle) {
      setTitleDraft(null);
      setIsEditingTitle(false);
      return;
    }

    if (nextTitle !== thread.title) {
      updateThread(thread.id, { title: nextTitle });
    }
    setTitleDraft(null);
    setIsEditingTitle(false);
  };

  const startEditingTitle = () => {
    setTitleDraft(thread.title);
    setIsEditingTitle(true);
  };

  const handleDeleteThread = () => {
    const totalTaskCount = thread.tasks.length;
    const completedTaskCount = thread.tasks.filter((task) => task.completed).length;
    const taskWarning = totalTaskCount > 0
      ? ` This deletes its ${totalTaskCount} ${totalTaskCount === 1 ? "task" : "tasks"}${completedTaskCount > 0 ? `, including ${completedTaskCount} completed ${completedTaskCount === 1 ? "task" : "tasks"}` : ""}.`
      : "";
    const completedWarning = completedTaskCount > 0
      ? " Archive instead to keep them."
      : totalTaskCount > 0
        ? ` Archive instead to keep ${totalTaskCount === 1 ? "it" : "them"}.`
        : "";
    const confirmed = window.confirm(
      `Delete "${thread.title || "Untitled thread"}"?${taskWarning}${completedWarning} Deletion cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    deleteThread(thread.id);
    router.push("/threads");
  };

  const handleAddTask = () => {
    if (isReadOnly) {
      return;
    }
    const taskId = addThreadTask(thread.id);
    pendingFocusRef.current = { id: taskId, mode: "selectAll" };
  };

  const handleTaskKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    taskId: string,
    value: string,
    previousTaskId?: string,
  ) => {
    if (isReadOnly) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleAddTask();
      return;
    }

    if (event.key === "Backspace" && value.trim() === "") {
      event.preventDefault();
      if (previousTaskId) {
        pendingFocusRef.current = { id: previousTaskId, mode: "cursorEnd" };
      }
      deleteThreadTask(thread.id, taskId);
    }
  };

  const getScheduleLabel = (date: string) => {
    const parsedDate = parseISO(date);
    if (isToday(parsedDate)) {
      return "Today";
    }
    if (isTomorrow(parsedDate)) {
      return "Tomorrow";
    }
    if (isYesterday(parsedDate)) {
      return "Yesterday";
    }
    return format(parsedDate, "MMM d");
  };

  const renderTaskContent = (task: ThreadTaskItem, previousTaskId?: string, completed = false, isDragging = false) => {
    const scheduledDates = scheduledDatesByReferenceId.get(task.referenceId) ?? [];

    return (
      <TaskLine
        actionAriaLabel={isReadOnly ? "Open task menu" : "Open task menu or long-press to reorder"}
        actionDisabled={isReadOnly || isDragging}
        actionTitle={isReadOnly ? "Open task menu" : "Open task menu or long-press to reorder"}
        canRequestEstimate={!task.durationMinutes && task.text.trim() !== ""}
        checkboxDisabled={isReadOnly || task.text.trim() === ""}
        completed={completed}
        dragHandleProps={getDragHandleProps(task, completed, !isReadOnly)}
        isDragging={isDragging}
        isDurationEditing={editingDurationTaskId === task.id}
        isMenuOpen={openMenuId === task.id}
        item={task}
        lineRef={(element) => {
          if (!isDragging) {
            rowRefs.current[task.id] = element;
          }
        }}
        menuAriaLabel="Thread task actions"
        menuLeadingItems={(
          <>
                {!task.completed ? (
                  <button
                    type="button"
                    className="task-line-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      setScheduleTaskId(task.id);
                      setMenuViewDate(parseISO(today));
                    }}
                  >
                    <CalendarPlus size={15} />
                    <span>Add to day</span>
                  </button>
                ) : null}
          </>
        )}
        menuMeta={scheduledDates.length > 0 ? (
          <div className="task-line-menu-meta">
            On {scheduledDates.map(getScheduleLabel).join(", ")}
          </div>
        ) : null}
        menuRef={(element) => {
          menuRefs.current[task.id] = element;
        }}
        onCompletedChange={(checked) => updateThreadTask(thread.id, task.id, { completed: checked })}
        onDelete={() => {
          deleteThreadTask(thread.id, task.id);
          setOpenMenuId(null);
        }}
        onDurationChange={(durationMinutes) => updateThreadTask(thread.id, task.id, { durationMinutes })}
        onDurationEditEnd={() => setEditingDurationTaskId((current) => (current === task.id ? null : current))}
        onDurationEnter={handleAddTask}
        onMenuToggle={() => {
          if (consumeSuppressedClick(task.id)) {
            return;
          }

          setOpenScheduleMenuId(null);
          setOpenMenuId((current) => (current === task.id ? null : task.id));
        }}
        onRequestEstimate={() => {
          setOpenMenuId(null);
          setEditingDurationTaskId(task.id);
        }}
        onTextChange={(text) => updateThreadTask(thread.id, task.id, { text })}
        onTextKeyDown={(event, itemId, value, previousId) => handleTaskKeyDown(event, itemId, value, previousId)}
        pendingFocusRef={pendingFocusRef}
        previousItemId={previousTaskId}
        readOnly={isReadOnly}
        trailingContent={scheduledDates.length > 0 ? (
          <div
            className="thread-task-schedule-menu"
            ref={(element) => {
              scheduleMenuRefs.current[task.id] = element;
            }}
          >
            <button
              type="button"
              className="thread-task-schedule-indicator"
              aria-label={`Show scheduled dates for ${task.text || "this task"}`}
              title={`Scheduled on ${scheduledDates.map(getScheduleLabel).join(", ")}`}
              aria-expanded={openScheduleMenuId === task.id}
              onClick={() => {
                setOpenMenuId(null);
                setOpenScheduleMenuId((current) => (current === task.id ? null : task.id));
              }}
            >
              <CalendarClock size={15} />
            </button>
            {openScheduleMenuId === task.id ? (
              <div className="thread-task-schedule-popover" role="menu" aria-label="Scheduled dates">
                {scheduledDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="thread-task-schedule-date"
                    role="menuitem"
                    onClick={() => {
                      setOpenScheduleMenuId(null);
                      router.push(`/?date=${date}`);
                    }}
                  >
                    {getScheduleLabel(date)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      />
    );
  };

  const renderTaskRow = (task: ThreadTaskItem, previousTaskId?: string, completed = false) => {
    const isDragging = dragState?.itemId === task.id;

    return (
      <div
        className={`task-line-slot${isDragging ? " dragging" : ""}`}
        key={task.id}
        style={
          isDragging && dragState
            ? {
                height: `${dragState.height}px`,
              }
            : undefined
        }
      >
        {!isDragging ? renderTaskContent(task, previousTaskId, completed) : null}
      </div>
    );
  };

  const draggedTask = dragState
    ? thread.tasks.find((task) => task.id === dragState.itemId) ?? null
    : null;
  const draggedTaskPreviousId = draggedTask
    ? (dragState?.completed ? completedTasks : openTasks)[
        (dragState?.completed ? completedTasks : openTasks).findIndex((task) => task.id === draggedTask.id) - 1
      ]?.id
    : undefined;

  return (
    <>
      <div className="app-shell">
        <PageHeader
          title="Threads"
          icon={<Layers size={30} color="var(--accent-color)" />}
        />

        <div className="thread-detail-toolbar">
          <button
            type="button"
            className="btn-icon thread-detail-toolbar-button"
            aria-label="Back to threads"
            title="Back to threads"
            onClick={() => router.push("/threads")}
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <input
            className="thread-picker-static thread-title-input"
            aria-label="Thread title"
            style={{ width: `clamp(132px, ${titleWidthCh}ch, min(360px, calc(100vw - 144px)))` }}
            value={titleValue}
            onFocus={startEditingTitle}
            onDoubleClick={(event) => event.currentTarget.select()}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitleDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setTitleDraft(null);
                setIsEditingTitle(false);
                event.currentTarget.blur();
              }
            }}
          />
          <div
            className="thread-detail-action-menu"
            ref={threadActionMenuRef}
          >
            <button
              type="button"
              className="btn-icon thread-detail-toolbar-button"
              aria-label="Open thread menu"
              title="Open thread menu"
              aria-expanded={isThreadActionMenuOpen}
              onClick={() => {
                setOpenMenuId(null);
                setOpenScheduleMenuId(null);
                setIsThreadActionMenuOpen((current) => !current);
              }}
            >
              <MoreVertical size={17} />
            </button>
            {isThreadActionMenuOpen ? (
              <div className="thread-detail-menu-popover" role="menu" aria-label="Thread actions">
                <button
                  type="button"
                  className="thread-detail-menu-item"
                  role="menuitem"
                  onClick={() => {
                    updateThread(thread.id, { archived: !thread.archived });
                    setIsThreadActionMenuOpen(false);
                  }}
                >
                  {thread.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  <span>{thread.archived ? "Unarchive" : "Archive"}</span>
                </button>
                <button
                  type="button"
                  className="thread-detail-menu-item danger"
                  role="menuitem"
                  onClick={() => {
                    setIsThreadActionMenuOpen(false);
                    handleDeleteThread();
                  }}
                >
                  <Trash2 size={15} />
                  <span>Delete</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <section className="card task-list-card" ref={taskListCardRef}>
          <div className="task-list">
            <div ref={openItemsRef}>
              {openTasks.length === 0 ? (
                <div className="empty-state task-empty-state">No open tasks in this thread.</div>
              ) : (
                openTasks.map((task, index) => renderTaskRow(task, openTasks[index - 1]?.id))
              )}
            </div>

            <button className="task-add-row" onClick={handleAddTask} disabled={isReadOnly}>
              <Plus size={18} />
              <span>{isReadOnly ? "Archived thread" : "Add item"}</span>
            </button>
          </div>

          {completedTasks.length > 0 ? (
            <div className="task-completed-section">
              <div className="task-section-label">
                {completedTasks.length} Completed {completedTasks.length === 1 ? "item" : "items"}
              </div>
              <div className="task-list" ref={completedItemsRef}>
                {completedTasks.map((task, index) => renderTaskRow(task, completedTasks[index - 1]?.id, true))}
              </div>
            </div>
          ) : null}

          {dragState && draggedTask ? (
            <div
              className="task-drag-overlay"
              style={dragOverlayStyle}
            >
              {renderTaskContent(draggedTask, draggedTaskPreviousId, dragState.completed, true)}
            </div>
          ) : null}
        </section>

      </div>

      {scheduleTask && !isReadOnly ? (
        <div
          className="task-action-datepicker-overlay"
          onClick={() => setScheduleTaskId(null)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <DatePickerPopupContent
              selectedDate={today}
              onChange={(targetDate) => {
                scheduleThreadTaskToDate(thread.id, scheduleTask.id, targetDate);
                setScheduleTaskId(null);
              }}
              viewDate={menuViewDate}
              onViewDateChange={setMenuViewDate}
              popupClassName="task-action-datepicker-popup"
              title="Add Thread Task To"
              onCancel={() => setScheduleTaskId(null)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function ThreadPage({ threadId }: { threadId: string }) {
  return (
    <ClientReady>
      <ThreadScreen threadId={threadId} />
    </ClientReady>
  );
}
