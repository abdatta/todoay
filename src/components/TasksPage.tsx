"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type FormEvent } from "react";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { Plus, GripVertical, Trash2, Copy, CheckSquare2, ChevronsRight } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import { DatePickerPopupContent } from "@/components/CustomDatePicker";
import DateNavigator from "@/components/DateNavigator";
import PageHeader from "@/components/PageHeader";
import type { TodoItem } from "@/lib/types";
import { useTodoay } from "@/lib/store";

type MenuDateAction = {
  todoId: string;
  mode: "copy" | "move";
};

type DragState = {
  todoId: string;
  completed: boolean;
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

const LONG_PRESS_MS = 180;
const LONG_PRESS_MOVE_TOLERANCE = 8;

function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) {
    return;
  }

  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function TasksScreen() {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentYear = new Date().getFullYear();
  const [selectedDate, setSelectedDate] = useState(today);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuDateAction, setMenuDateAction] = useState<MenuDateAction | null>(null);
  const [menuViewDate, setMenuViewDate] = useState<Date>(parseISO(today));
  const [dragState, setDragState] = useState<DragState | null>(null);
  const pendingFocusRef = useRef<{ id: string; mode: "selectAll" | "cursorEnd" } | null>(null);
  const inputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const taskCardRef = useRef<HTMLElement | null>(null);
  const openItemsRef = useRef<HTMLDivElement | null>(null);
  const completedListRef = useRef<HTMLDivElement | null>(null);
  const longPressRef = useRef<{ todoId: string; pointerId: number; timeoutId: number | null; startX: number; startY: number } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const {
    ready,
    state,
    addTodo,
    updateTodo,
    deleteTodo,
    reorderTodo,
    copyTodoToDate,
    copyTodoReferenceToDate,
    moveTodoReferenceToDate,
    getVisibleTodos,
  } = useTodoay();

  const visibleTodos = useMemo(() => getVisibleTodos(selectedDate, today), [getVisibleTodos, selectedDate, today]);
  const openTodos = visibleTodos.filter((item) => !item.completed);
  const completedTodos = visibleTodos.filter((item) => item.completed);
  const dateProgress = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(state.todosByDate).flatMap(([date, items]) => {
          if (items.length === 0) {
            return [];
          }

          const completed = items.filter((item) => item.completed).length;
          return [[date, { completed, total: items.length }] as const];
        }),
      ),
    [state.todosByDate],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!openMenuId) {
        return;
      }
      const currentMenu = menuRefs.current[openMenuId];
      if (currentMenu && event.target instanceof Node && !currentMenu.contains(event.target)) {
        setOpenMenuId(null);
        setMenuDateAction(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setMenuDateAction(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenuId]);

  useEffect(() => {
    return () => {
      if (longPressRef.current?.timeoutId) {
        window.clearTimeout(longPressRef.current.timeoutId);
      }
    };
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current?.timeoutId) {
      window.clearTimeout(longPressRef.current.timeoutId);
    }
    longPressRef.current = null;
  }, []);

  const moveDraggedTodo = useCallback((todoId: string, completed: boolean, clientY: number) => {
    const sectionTodos = (completed ? completedTodos : openTodos).filter((item) => item.sourceDate === selectedDate);
    if (sectionTodos.length < 2) {
      return;
    }

    let closestTodoId: string | null = null;
    let closestPlacement: "before" | "after" = "before";
    let closestDistance = Number.POSITIVE_INFINITY;

    sectionTodos.forEach((candidate) => {
      const element = rowRefs.current[candidate.id];
      if (!element || candidate.id === todoId) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const distance = Math.abs(clientY - midpoint);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestTodoId = candidate.id;
        closestPlacement = clientY < midpoint ? "before" : "after";
      }
    });

    if (!closestTodoId) {
      return;
    }

    reorderTodo(selectedDate, todoId, closestTodoId, closestPlacement);
  }, [completedTodos, openTodos, reorderTodo, selectedDate]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setDragState((current) =>
        current && current.pointerId === event.pointerId
          ? { ...current, currentX: event.clientX, currentY: event.clientY }
          : current,
      );
      moveDraggedTodo(dragState.todoId, dragState.completed, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }
        suppressClickRef.current = current.todoId;
        return null;
      });
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
  }, [clearLongPress, dragState, moveDraggedTodo]);

  const handleAddTodo = () => {
    const nextTodoId = addTodo(selectedDate);
    pendingFocusRef.current = { id: nextTodoId, mode: "selectAll" };
  };

  const handleDateAction = (todo: TodoItem, mode: MenuDateAction["mode"], targetDate: string) => {
    if (mode === "copy") {
      if (state.copyToBehavior === "value") {
        copyTodoToDate(todo.sourceDate, todo.id, targetDate);
      } else {
        copyTodoReferenceToDate(todo.sourceDate, todo.id, targetDate);
      }
    } else {
      moveTodoReferenceToDate(todo.sourceDate, todo.id, targetDate);
    }

    setOpenMenuId(null);
    setMenuDateAction(null);
  };

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

  const renderTodoContent = (todo: TodoItem, previousTodoId?: string, completed = false, isDragging = false) => {
    const canReorder = todo.sourceDate === selectedDate;
    const otherDates = Object.entries(state.todosByDate)
      .filter(([date, items]) => date !== todo.sourceDate && items.some((item) => item.referenceId === todo.referenceId))
      .map(([date]) => ({ value: date, label: getDateLabel(date) }))
      .sort((left, right) => left.value.localeCompare(right.value))
      .map(({ label }) => label);

    return (
      <div
        className={`task-line${completed ? " completed" : ""}${isDragging ? " dragging" : ""}`}
        ref={(element) => {
          if (!isDragging) {
            rowRefs.current[todo.id] = element;
          }
        }}
      >
          <input
            className="todo-checkbox"
            type="checkbox"
            disabled={todo.text.trim() === ""}
            checked={todo.completed}
            onChange={(event) => updateTodo(todo.sourceDate, todo.id, { completed: event.target.checked })}
          />
          <textarea
            className={`task-text-input${completed ? " completed" : ""}`}
            ref={(element) => {
              autoResizeTextarea(element);
              inputRefs.current[todo.id] = element;
              if (element && pendingFocusRef.current?.id === todo.id) {
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
            value={todo.text}
            onKeyDown={(event) => handleTodoKeyDown(event, todo.id, todo.sourceDate, todo.text, previousTodoId)}
            onInput={(event: FormEvent<HTMLTextAreaElement>) => autoResizeTextarea(event.currentTarget)}
            onChange={(event) => updateTodo(todo.sourceDate, todo.id, { text: event.target.value })}
          />
          <div
            className="task-line-menu"
            ref={(element) => {
              menuRefs.current[todo.id] = element;
            }}
          >
            <button
              className="task-line-action"
              title={canReorder ? "Open task menu or long-press to reorder" : "Open task menu"}
              aria-label={canReorder ? "Open task menu or long-press to reorder" : "Open task menu"}
              aria-expanded={openMenuId === todo.id}
              disabled={isDragging}
              onClick={() => {
                if (suppressClickRef.current === todo.id) {
                  suppressClickRef.current = null;
                  return;
                }

                setOpenMenuId((current) => (current === todo.id ? null : todo.id));
                setMenuDateAction(null);
              }}
              onPointerDown={(event) => {
                if (!canReorder) {
                  return;
                }

                clearLongPress();
                longPressRef.current = {
                  todoId: todo.id,
                pointerId: event.pointerId,
                timeoutId: window.setTimeout(() => {
                  const rowRect = rowRefs.current[todo.id]?.getBoundingClientRect();
                  const cardRect = taskCardRef.current?.getBoundingClientRect();
                  const sectionRect = (completed ? completedListRef.current : openItemsRef.current)?.getBoundingClientRect();
                  setOpenMenuId(null);
                  setMenuDateAction(null);
                  setDragState({
                    todoId: todo.id,
                    completed,
                    pointerId: event.pointerId,
                      startX: event.clientX,
                    startY: event.clientY,
                    currentX: event.clientX,
                    currentY: event.clientY,
                    originLeft: (rowRect?.left ?? 0) - (cardRect?.left ?? 0),
                    originTop: (rowRect?.top ?? 0) - (cardRect?.top ?? 0),
                    width: rowRect?.width ?? 0,
                    height: rowRect?.height ?? 60,
                    boundsLeft: ((sectionRect?.left ?? cardRect?.left) ?? 0) - (cardRect?.left ?? 0),
                    boundsTop: ((sectionRect?.top ?? cardRect?.top) ?? 0) - (cardRect?.top ?? 0),
                    boundsWidth: sectionRect?.width ?? cardRect?.width ?? 0,
                    boundsHeight: sectionRect?.height ?? cardRect?.height ?? 0,
                  });
                  suppressClickRef.current = todo.id;
                }, LONG_PRESS_MS),
                  startX: event.clientX,
                  startY: event.clientY,
                };
              }}
              onPointerMove={(event) => {
                const pendingLongPress = longPressRef.current;

                if (!pendingLongPress || pendingLongPress.todoId !== todo.id || pendingLongPress.pointerId !== event.pointerId) {
                  return;
                }

                if (
                  Math.abs(event.clientX - pendingLongPress.startX) > LONG_PRESS_MOVE_TOLERANCE ||
                  Math.abs(event.clientY - pendingLongPress.startY) > LONG_PRESS_MOVE_TOLERANCE
                ) {
                  clearLongPress();
                }
              }}
              onPointerUp={(event) => {
                const pendingLongPress = longPressRef.current;
                if (
                  pendingLongPress &&
                  pendingLongPress.todoId === todo.id &&
                  pendingLongPress.pointerId === event.pointerId
                ) {
                  clearLongPress();
                }
              }}
              onPointerCancel={() => {
                clearLongPress();
                setDragState((current) => (current?.todoId === todo.id ? null : current));
              }}
            >
              <GripVertical size={16} />
            </button>
            {openMenuId === todo.id ? (
              <div className="task-line-menu-popover" role="menu" aria-label="Task actions">
                {!todo.completed ? (
                  <>
                    <button
                      className="task-line-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        setMenuDateAction({ todoId: todo.id, mode: "move" });
                        setMenuViewDate(parseISO(selectedDate));
                      }}
                    >
                      <ChevronsRight size={15} />
                      <span>Move to</span>
                    </button>
                    <button
                      className="task-line-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        setMenuDateAction({ todoId: todo.id, mode: "copy" });
                        setMenuViewDate(parseISO(selectedDate));
                      }}
                    >
                      <Copy size={15} />
                      <span>Copy to</span>
                    </button>
                  </>
                ) : null}
                <button
                  className="task-line-menu-item danger"
                  role="menuitem"
                  onClick={() => {
                    deleteTodo(todo.sourceDate, todo.id);
                    setOpenMenuId(null);
                    setMenuDateAction(null);
                  }}
                >
                  <Trash2 size={15} />
                  <span>Delete</span>
                </button>
                {otherDates.length > 0 ? (
                  <div className="task-line-menu-meta">
                    Also in {otherDates.join(", ")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
      </div>
    );
  };

  const renderTodoRow = (todo: TodoItem, previousTodoId?: string, completed = false) => {
    const isDragging = dragState?.todoId === todo.id;

    return (
      <div
        key={todo.id}
        className={`task-line-slot${isDragging ? " dragging" : ""}`}
        style={
          isDragging
            ? {
                height: `${dragState.height}px`,
              }
            : undefined
        }
      >
        {!isDragging ? renderTodoContent(todo, previousTodoId, completed) : null}
      </div>
    );
  };

  const handleTodoKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    todoId: string,
    sourceDate: string,
    value: string,
    previousTodoId?: string,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddTodo();
      return;
    }

    if (event.key === "Backspace" && value.trim() === "") {
      event.preventDefault();
      if (previousTodoId) {
        pendingFocusRef.current = { id: previousTodoId, mode: "cursorEnd" };
      }
      deleteTodo(sourceDate, todoId);
    }
  };

  if (!ready) {
    return <div className="loading-screen">Loading Todoay...</div>;
  }

  const dateActionTodo = menuDateAction
    ? visibleTodos.find((todo) => todo.id === menuDateAction.todoId) ?? null
    : null;
  const draggedTodo = dragState
    ? visibleTodos.find((todo) => todo.id === dragState.todoId) ?? null
    : null;
  const draggedTodoPreviousId = draggedTodo
    ? (dragState?.completed ? completedTodos : openTodos)[
        (dragState?.completed ? completedTodos : openTodos).findIndex((todo) => todo.id === draggedTodo.id) - 1
      ]?.id
    : undefined;
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

  return (
    <>
      <div className="app-shell">
        <PageHeader
          title="Tasks"
          icon={<CheckSquare2 size={30} color="var(--accent-color)" />}
        />

        <DateNavigator date={selectedDate} onChange={setSelectedDate} dateProgress={dateProgress} />

        <section
          className="card task-list-card"
          ref={taskCardRef}
        >
          <div
            className="task-list"
          >
            <div ref={openItemsRef}>
              {openTodos.length === 0 ? (
                <div className="empty-state task-empty-state">No open tasks for this day.</div>
              ) : (
                openTodos.map((todo, index) => renderTodoRow(todo, openTodos[index - 1]?.id))
              )}
            </div>

            <button className="task-add-row" onClick={handleAddTodo}>
              <Plus size={18} />
              <span>Add item</span>
            </button>
          </div>

          {completedTodos.length > 0 ? (
            <div className="task-completed-section">
              <div className="task-section-label">{completedTodos.length} Completed {completedTodos.length === 1 ? "item" : "items"}</div>
              <div
                className="task-list"
                ref={completedListRef}
              >
                {completedTodos.map((todo, index) => renderTodoRow(todo, completedTodos[index - 1]?.id, true))}
              </div>
            </div>
          ) : null}

          {dragState && draggedTodo ? (
            <div
              className="task-drag-overlay"
              style={{
                left: `${dragState.originLeft}px`,
                top: `${dragState.originTop}px`,
                width: `${dragState.width}px`,
                minHeight: `${dragState.height}px`,
                transform: `translate(${dragOffsetX}px, ${dragOffsetY}px) scale(1.02)`,
              }}
            >
              {renderTodoContent(draggedTodo, draggedTodoPreviousId, dragState.completed, true)}
            </div>
          ) : null}
        </section>
      </div>
      {menuDateAction && dateActionTodo ? (
        <div
          className="task-action-datepicker-overlay"
          onClick={() => setMenuDateAction(null)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <DatePickerPopupContent
              selectedDate={selectedDate}
              onChange={(targetDate) => handleDateAction(dateActionTodo, menuDateAction.mode, targetDate)}
              viewDate={menuViewDate}
              onViewDateChange={setMenuViewDate}
              popupClassName="task-action-datepicker-popup"
              title={menuDateAction.mode === "copy" ? "Copy Task To" : "Move Task To"}
              onCancel={() => setMenuDateAction(null)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function TasksPage() {
  return (
    <ClientReady>
      <TasksScreen />
    </ClientReady>
  );
}
