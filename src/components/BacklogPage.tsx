"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { Copy, MoreVertical, Trash2, ChevronsRight } from "lucide-react";
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

export default function BacklogTaskList({ onSelectDate }: { onSelectDate: (date: string) => void }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentYear = new Date().getFullYear();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copyTodo, setCopyTodo] = useState<TodoItem | null>(null);
  const [menuViewDate, setMenuViewDate] = useState<Date>(parseISO(today));
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { state, copyTodoToDate, copyTodoReferenceToDate } = useTodoay();

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
            if (todo.completed || todo.text.trim() === "" || futureReferenceIds.has(todo.referenceId)) {
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
  }, [state.todosByDate, today]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!openMenuId) {
        return;
      }
      const currentMenu = menuRefs.current[openMenuId];
      if (currentMenu && event.target instanceof Node && !currentMenu.contains(event.target)) {
        setOpenMenuId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenuId]);

  const handleCopyToDate = (todo: TodoItem, targetDate: string) => {
    if (state.copyToBehavior === "value") {
      copyTodoToDate(todo.sourceDate, todo.id, targetDate);
    } else {
      copyTodoReferenceToDate(todo.sourceDate, todo.id, targetDate);
    }

    setCopyTodo(null);
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
                {group.items.map(({ todo }) => (
                  <div className="task-line-slot" key={todo.referenceId}>
                    <div className="task-line backlog-task-line">
                      <input
                        className="todo-checkbox"
                        type="checkbox"
                        checked={false}
                        disabled
                        aria-label={`${todo.text} cannot be completed from backlog`}
                        readOnly
                      />
                      <span className="backlog-task-text">{todo.text}</span>
                      {todo.durationMinutes ? (
                        <span className={`task-duration-chip backlog-duration-chip tone-${getDurationTone(todo.durationMinutes)}`}>
                          {todo.durationMinutes}
                        </span>
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
                          onClick={() => setOpenMenuId((current) => (current === todo.referenceId ? null : todo.referenceId))}
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
                            <button
                              className="task-line-menu-item danger"
                              role="menuitem"
                              disabled
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
                ))}
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
    </>
  );
}
