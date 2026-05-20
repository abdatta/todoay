"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { Copy, MoreVertical, Trash2, ChevronsRight, Layers, X } from "lucide-react";
import { DatePickerPopupContent } from "@/components/CustomDatePicker";
import type { TodoItem } from "@/lib/types";
import { useTodoay } from "@/lib/store";

type BacklogEntry = {
  referenceId: string;
  todo: TodoItem;
  dates: string[];
  lastDate: string;
};

type BacklogGroup = {
  key: string;
  dates: string[];
  lastDate: string;
  items: BacklogEntry[];
};

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

function formatDateList(labels: string[]) {
  if (labels.length <= 2) {
    return labels.join(" and ");
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export default function BacklogTaskList({ onSelectDate }: { onSelectDate: (date: string) => void }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentYear = new Date().getFullYear();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const [copyTodo, setCopyTodo] = useState<TodoItem | null>(null);
  const [threadActionTodo, setThreadActionTodo] = useState<TodoItem | null>(null);
  const [menuViewDate, setMenuViewDate] = useState<Date>(parseISO(today));
  const [sessionCompletedReferenceIds, setSessionCompletedReferenceIds] = useState<Set<string>>(() => new Set());
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const threadMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const {
    state,
    addTodoToThread,
    copyTodoToDate,
    copyTodoReferenceToDate,
    deleteTodoReference,
    updateTodo,
  } = useTodoay();
  const availableThreads = useMemo(
    () =>
      state.threads
        .filter((thread) => !thread.archived)
        .sort((left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          left.sortOrder - right.sortOrder ||
          left.createdAt.localeCompare(right.createdAt),
        ),
    [state.threads],
  );

  const getDateLabel = (date: string) => {
    const parsedDate = parseISO(date);
    if (isToday(parsedDate)) {
      return "Today";
    }
    if (isYesterday(parsedDate)) {
      return "Yesterday";
    }
    if (isTomorrow(parsedDate)) {
      return "Tomorrow";
    }
    return parsedDate.getFullYear() === currentYear
      ? format(parsedDate, "MMM d")
      : format(parsedDate, "MMM d, yyyy");
  };

  const groups = useMemo<BacklogGroup[]>(() => {
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
              (todo.completed && !sessionCompletedReferenceIds.has(todo.referenceId)) ||
              todo.text.trim() === "" ||
              futureReferenceIds.has(todo.referenceId)
            ) {
              return;
            }

            const current = entriesByReferenceId.get(todo.referenceId);
            if (!current) {
              entriesByReferenceId.set(todo.referenceId, {
                referenceId: todo.referenceId,
                todo,
                dates: [date],
                lastDate: date,
              });
              return;
            }

            if (!current.dates.includes(date)) {
              current.dates.push(date);
            }

            if (date >= current.lastDate) {
              current.todo = todo;
              current.lastDate = date;
            }
          });
      });

    const grouped = new Map<string, BacklogGroup>();
    [...entriesByReferenceId.values()]
      .filter((entry) =>
        !entry.dates.some((date) => futureCopiedSourceKeys.has(`${date}|${entry.todo.text.trim()}`)),
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
          return left.todo.sortOrder - right.todo.sortOrder;
        }),
      }))
      .sort((left, right) => right.lastDate.localeCompare(left.lastDate));
  }, [sessionCompletedReferenceIds, state.todosByDate, today]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!openMenuId && !openThreadMenuId) {
        return;
      }
      const currentMenu = openMenuId ? menuRefs.current[openMenuId] : null;
      const currentThreadMenu = openThreadMenuId ? threadMenuRefs.current[openThreadMenuId] : null;
      if (currentMenu && event.target instanceof Node && !currentMenu.contains(event.target)) {
        setOpenMenuId(null);
      }
      if (currentThreadMenu && event.target instanceof Node && !currentThreadMenu.contains(event.target)) {
        setOpenThreadMenuId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setOpenThreadMenuId(null);
        setThreadActionTodo(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenuId, openThreadMenuId]);

  const handleCopyToDate = (todo: TodoItem, targetDate: string) => {
    if (state.copyToBehavior === "value") {
      copyTodoToDate(todo.sourceDate, todo.id, targetDate);
    } else {
      copyTodoReferenceToDate(todo.sourceDate, todo.id, targetDate);
    }

    setCopyTodo(null);
    setOpenMenuId(null);
  };

  const handleThreadAction = (todo: TodoItem, threadId: string) => {
    addTodoToThread(todo.sourceDate, todo.id, threadId);
    setThreadActionTodo(null);
  };

  const handleCompletionChange = (todo: TodoItem, completed: boolean) => {
    setSessionCompletedReferenceIds((current) => {
      const next = new Set(current);
      if (completed) {
        next.add(todo.referenceId);
      } else {
        next.delete(todo.referenceId);
      }
      return next;
    });
    updateTodo(todo.sourceDate, todo.id, { completed });
  };

  const handleDelete = (todo: TodoItem, dates: string[]) => {
    const thread = state.threads.find((candidate) =>
      candidate.tasks.some((task) => task.referenceId === todo.referenceId),
    );
    const dateList = formatDateList(dates.map(getDateLabel));
    const threadWarning = thread
      ? ` It will still be available in "${thread.title || "Untitled thread"}" thread.`
      : " It will be completely removed.";
    const confirmed = window.confirm(
      `Delete this backlog task from ${dateList}?${threadWarning}`,
    );
    if (!confirmed) {
      return;
    }

    deleteTodoReference(todo.sourceDate, todo.id);
    setSessionCompletedReferenceIds((current) => {
      const next = new Set(current);
      next.delete(todo.referenceId);
      return next;
    });
    setOpenMenuId(null);
  };

  return (
    <>
      <section className="card task-list-card backlog-list-card">
        {groups.length === 0 ? (
          <div className="empty-state task-empty-state">No backlog tasks.</div>
        ) : (
          groups.map((group) => (
            <div className="backlog-date-group" key={group.key}>
              <div className="backlog-date-divider">
                <div className="backlog-date-links">
                  {group.dates.map((date) => (
                    <button
                      type="button"
                      className="backlog-date-link"
                      key={date}
                      title={`Open ${getDateLabel(date)}`}
                      onClick={() => onSelectDate(date)}
                    >
                      {getDateLabel(date)}
                    </button>
                  ))}
                </div>
                <span className="backlog-date-divider-line" />
              </div>

              <div className="task-list">
                {group.items.map(({ todo, dates }) => {
                  const sourceThread = state.threads.find((thread) =>
                    thread.tasks.some((task) => task.referenceId === todo.referenceId),
                  ) ?? null;

                  return (
                    <div className="task-line-slot" key={todo.referenceId}>
                      <div className={`task-line backlog-task-line${todo.completed ? " completed" : ""}`}>
                        <input
                          className="todo-checkbox"
                          type="checkbox"
                          checked={todo.completed}
                          aria-label={`${todo.completed ? "Mark incomplete" : "Mark complete"}: ${todo.text}`}
                          onChange={(event) => handleCompletionChange(todo, event.target.checked)}
                        />
                        <span className={`backlog-task-text${todo.completed ? " completed" : ""}`}>{todo.text}</span>
                        {todo.durationMinutes ? (
                          <span className={`task-duration-chip backlog-duration-chip tone-${getDurationTone(todo.durationMinutes)}`}>
                            {todo.durationMinutes}
                          </span>
                        ) : null}
                        {sourceThread ? (
                          <div
                            className="date-task-thread-menu"
                            ref={(element) => {
                              threadMenuRefs.current[todo.referenceId] = element;
                            }}
                          >
                            <button
                              type="button"
                              className="thread-task-schedule-indicator date-task-thread-indicator"
                              aria-label={`Show thread for ${todo.text || "this task"}`}
                              title={`In ${sourceThread.title || "Untitled thread"}`}
                              aria-expanded={openThreadMenuId === todo.referenceId}
                              onClick={() => {
                                setOpenMenuId(null);
                                setOpenThreadMenuId((current) => (current === todo.referenceId ? null : todo.referenceId));
                              }}
                            >
                              <Layers size={15} />
                            </button>
                            {openThreadMenuId === todo.referenceId ? (
                              <div className="date-task-thread-popover" role="menu" aria-label="Thread">
                                <Link href={`/thread?threadId=${sourceThread.id}`} className="date-task-thread-link" role="menuitem">
                                  {sourceThread.title || "Untitled thread"}
                                </Link>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div
                          className="task-line-menu"
                          ref={(element) => {
                            menuRefs.current[todo.referenceId] = element;
                          }}
                        >
                          <button
                            className="task-line-action backlog-task-action"
                            title="Open task menu"
                            aria-label="Open task menu"
                            aria-expanded={openMenuId === todo.referenceId}
                            onClick={() => {
                              setOpenThreadMenuId(null);
                              setOpenMenuId((current) => (current === todo.referenceId ? null : todo.referenceId));
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenuId === todo.referenceId ? (
                            <div className="task-line-menu-popover" role="menu" aria-label="Backlog task actions">
                              <button
                                className="task-line-menu-item"
                                role="menuitem"
                                disabled
                              >
                                <ChevronsRight size={15} />
                                <span>Move to</span>
                              </button>
                              <button
                                className="task-line-menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setCopyTodo(todo);
                                  setMenuViewDate(parseISO(today));
                                }}
                              >
                                <Copy size={15} />
                                <span>Copy to</span>
                              </button>
                              {!sourceThread && todo.text.trim() !== "" ? (
                                <button
                                  type="button"
                                  className="task-line-menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setThreadActionTodo(todo);
                                  }}
                                >
                                  <Layers size={15} />
                                  <span>Add to thread</span>
                                </button>
                              ) : null}
                              <button
                                className="task-line-menu-item danger"
                                role="menuitem"
                                onClick={() => handleDelete(todo, dates)}
                              >
                                <Trash2 size={15} />
                                <span>Delete</span>
                              </button>
                              <div className="task-line-menu-meta">
                                Open a listed date to edit this task.
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      {copyTodo ? (
        <div
          className="task-action-datepicker-overlay"
          onClick={() => setCopyTodo(null)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <DatePickerPopupContent
              selectedDate={today}
              onChange={(targetDate) => handleCopyToDate(copyTodo, targetDate)}
              viewDate={menuViewDate}
              onViewDateChange={setMenuViewDate}
              popupClassName="task-action-datepicker-popup"
              title="Copy Task To"
              onCancel={() => setCopyTodo(null)}
            />
          </div>
        </div>
      ) : null}
      {threadActionTodo ? (
        <div
          className="task-action-datepicker-overlay"
          onClick={() => setThreadActionTodo(null)}
        >
          <div
            className="datepicker-popup task-action-thread-picker-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backlog-thread-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="datepicker-modal-header">
              <div id="backlog-thread-picker-title" className="datepicker-modal-title">Add Task To Thread</div>
              <button
                type="button"
                className="datepicker-modal-close"
                aria-label="Cancel"
                onClick={() => setThreadActionTodo(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="task-thread-picker-list">
              {availableThreads.length > 0 ? (
                availableThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className="task-thread-picker-option"
                    onClick={() => handleThreadAction(threadActionTodo, thread.id)}
                  >
                    <Layers size={16} />
                    <span>{thread.title || "Untitled thread"}</span>
                  </button>
                ))
              ) : (
                <div className="task-thread-picker-empty">No active threads.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
