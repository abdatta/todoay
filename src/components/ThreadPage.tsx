"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  CalendarClock,
  Layers,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import ClientReady from "@/components/ClientReady";
import { DatePickerPopupContent } from "@/components/CustomDatePicker";
import PageHeader from "@/components/PageHeader";
import type { ThreadTaskItem } from "@/lib/types";
import { useTodoay } from "@/lib/store";

function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) {
    return;
  }

  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function getDurationTone(durationMinutes: number | undefined) {
  if (!durationMinutes) {
    return "empty";
  }
  if (durationMinutes < 15) {
    return "quick";
  }
  if (durationMinutes < 60) {
    return "medium";
  }
  if (durationMinutes < 360) {
    return "deep";
  }
  return "long";
}

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
    scheduleThreadTaskToDate,
  } = useTodoay();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openScheduleMenuId, setOpenScheduleMenuId] = useState<string | null>(null);
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const [menuViewDate, setMenuViewDate] = useState<Date>(parseISO(today));
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scheduleMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingFocusRef = useRef<{ id: string; mode: "selectAll" | "cursorEnd" } | null>(null);
  const inputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const thread = state.threads.find((candidate) => candidate.id === threadId) ?? null;
  const openTasks = thread?.tasks.filter((task) => !task.completed) ?? [];
  const completedTasks = thread?.tasks.filter((task) => task.completed) ?? [];

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

    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setOpenScheduleMenuId(null);
        setScheduleTaskId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenuId, openScheduleMenuId]);

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

  const renderTaskRow = (task: ThreadTaskItem, previousTaskId?: string, completed = false) => {
    const scheduledDates = scheduledDatesByReferenceId.get(task.referenceId) ?? [];

    return (
      <div className="task-line-slot" key={task.id}>
        <div className={`task-line${completed ? " completed" : ""}`}>
          <input
            className="todo-checkbox"
            type="checkbox"
            disabled={isReadOnly || task.text.trim() === ""}
            checked={task.completed}
            onChange={(event) => updateThreadTask(thread.id, task.id, { completed: event.target.checked })}
          />
          <div className="thread-task-copy">
            <textarea
              className={`task-text-input${completed ? " completed" : ""}`}
              ref={(element) => {
                autoResizeTextarea(element);
                inputRefs.current[task.id] = element;
                if (element && pendingFocusRef.current?.id === task.id) {
                  element.focus();
                  if (pendingFocusRef.current.mode === "selectAll") {
                    element.select();
                  } else {
                    const end = element.value.length;
                    element.setSelectionRange(end, end);
                  }
                  pendingFocusRef.current = null;
                }
              }}
              value={task.text}
              readOnly={isReadOnly}
              onKeyDown={(event) => handleTaskKeyDown(event, task.id, task.text, previousTaskId)}
              onInput={(event: FormEvent<HTMLTextAreaElement>) => autoResizeTextarea(event.currentTarget)}
              onChange={(event) => updateThreadTask(thread.id, task.id, { text: event.target.value })}
            />
          </div>
          {task.text.trim() !== "" ? (
            <input
              className={`task-duration-chip tone-${getDurationTone(task.durationMinutes)}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Estimated task duration in minutes"
              title="Estimated minutes"
              placeholder="min"
              value={task.durationMinutes ?? ""}
              readOnly={isReadOnly}
              disabled={isReadOnly}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 3);
                const durationMinutes = digits ? Number(digits) : undefined;
                updateThreadTask(thread.id, task.id, { durationMinutes });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddTask();
                }
              }}
            />
          ) : null}
          {scheduledDates.length > 0 ? (
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
          <div
            className="task-line-menu"
            ref={(element) => {
              menuRefs.current[task.id] = element;
            }}
          >
            <button
              type="button"
              className="task-line-action"
              title="Open task menu"
              aria-label="Open task menu"
              aria-expanded={openMenuId === task.id}
              disabled={isReadOnly}
              onClick={() => {
                setOpenScheduleMenuId(null);
                setOpenMenuId((current) => (current === task.id ? null : task.id));
              }}
            >
              <GripVertical size={16} />
            </button>
            {openMenuId === task.id && !isReadOnly ? (
              <div className="task-line-menu-popover" role="menu" aria-label="Thread task actions">
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
                <button
                  type="button"
                  className="task-line-menu-item danger"
                  role="menuitem"
                  onClick={() => {
                    deleteThreadTask(thread.id, task.id);
                    setOpenMenuId(null);
                  }}
                >
                  <Trash2 size={15} />
                  <span>Delete</span>
                </button>
                {scheduledDates.length > 0 ? (
                  <div className="task-line-menu-meta">
                    On {scheduledDates.map(getScheduleLabel).join(", ")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="app-shell">
        <PageHeader
          title="Threads"
          icon={<Layers size={30} color="var(--accent-color)" />}
          actions={
            <>
              <button
                type="button"
                className="btn-icon"
                aria-label={thread.archived ? "Restore thread" : "Archive thread"}
                title={thread.archived ? "Restore thread" : "Archive thread"}
                onClick={() => updateThread(thread.id, { archived: !thread.archived })}
              >
                {thread.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
              </button>
              <button
                type="button"
                className="btn-icon"
                aria-label="Delete thread"
                title="Delete thread"
                disabled={isReadOnly}
                onClick={() => {
                  deleteThread(thread.id);
                  router.push("/threads");
                }}
              >
                <Trash2 size={17} />
              </button>
            </>
          }
        />

        <div className="thread-selector-container">
          <button
            type="button"
            className="thread-picker-static"
            aria-label="Back to threads"
            onClick={() => router.push("/threads")}
          >
            <span>{thread.title || "Untitled thread"}</span>
          </button>
        </div>

        <section className="card task-list-card">
          <div className="task-list">
            <div>
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
              <div className="task-list">
                {completedTasks.map((task, index) => renderTaskRow(task, completedTasks[index - 1]?.id, true))}
              </div>
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
