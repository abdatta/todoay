"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { Plus, Copy, CheckSquare2, ChevronsRight, Layers, X } from "lucide-react";
import BacklogTaskList from "@/components/BacklogPage";
import ClientReady from "@/components/ClientReady";
import { DatePickerPopupContent } from "@/components/CustomDatePicker";
import DateNavigator from "@/components/DateNavigator";
import PageHeader from "@/components/PageHeader";
import { TaskLine, useTaskLineReorder, type TaskLineFocusRequest } from "@/components/TaskLine";
import type { TodoItem } from "@/lib/types";
import { useTodoay } from "@/lib/store";

type MenuDateAction = {
  todoId: string;
  mode: "copy" | "move";
};

function TasksScreen() {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentYear = new Date().getFullYear();
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window === "undefined") {
      return today;
    }

    const requestedDate = new URLSearchParams(window.location.search).get("date");
    return requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : today;
  });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const [menuDateAction, setMenuDateAction] = useState<MenuDateAction | null>(null);
  const [menuThreadTodoId, setMenuThreadTodoId] = useState<string | null>(null);
  const [editingDurationTodoId, setEditingDurationTodoId] = useState<string | null>(null);
  const [menuViewDate, setMenuViewDate] = useState<Date>(parseISO(today));
  const pendingFocusRef = useRef<TaskLineFocusRequest | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const threadMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
    addTodoToThread,
    getVisibleTodos,
  } = useTodoay();

  const visibleTodos = useMemo(() => getVisibleTodos(selectedDate, today), [getVisibleTodos, selectedDate, today]);
  const openTodos = useMemo(() => visibleTodos.filter((item) => !item.completed), [visibleTodos]);
  const completedTodos = useMemo(() => visibleTodos.filter((item) => item.completed), [visibleTodos]);
  const reorderableOpenTodos = useMemo(
    () => openTodos.filter((item) => item.sourceDate === selectedDate),
    [openTodos, selectedDate],
  );
  const reorderableCompletedTodos = useMemo(
    () => completedTodos.filter((item) => item.sourceDate === selectedDate),
    [completedTodos, selectedDate],
  );
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

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!openMenuId && !openThreadMenuId) {
        return;
      }
      const currentMenu = openMenuId ? menuRefs.current[openMenuId] : null;
      const currentThreadMenu = openThreadMenuId ? threadMenuRefs.current[openThreadMenuId] : null;
      if (event.target instanceof Node && currentMenu && !currentMenu.contains(event.target)) {
        setOpenMenuId(null);
        setMenuDateAction(null);
      }
      if (event.target instanceof Node && currentThreadMenu && !currentThreadMenu.contains(event.target)) {
        setOpenThreadMenuId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setOpenThreadMenuId(null);
        setMenuDateAction(null);
        setMenuThreadTodoId(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenuId, openThreadMenuId]);

  const handleReorderTodo = useCallback((todoId: string, targetTodoId: string, placement: "before" | "after") => {
    reorderTodo(selectedDate, todoId, targetTodoId, placement);
  }, [reorderTodo, selectedDate]);

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
    openItems: reorderableOpenTodos,
    completedItems: reorderableCompletedTodos,
    onReorder: handleReorderTodo,
    onBeforeDragStart: () => {
      setOpenMenuId(null);
      setOpenThreadMenuId(null);
      setMenuDateAction(null);
    },
  });

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

  const handleThreadAction = (todo: TodoItem, threadId: string) => {
    addTodoToThread(todo.sourceDate, todo.id, threadId);
    setMenuThreadTodoId(null);
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
    const sourceThread = todo.threadId
      ? state.threads.find((thread) => thread.id === todo.threadId) ?? null
      : null;

    return (
      <TaskLine
        actionAriaLabel={canReorder ? "Open task menu or long-press to reorder" : "Open task menu"}
        actionDisabled={isDragging}
        actionTitle={canReorder ? "Open task menu or long-press to reorder" : "Open task menu"}
        canRequestEstimate={!todo.durationMinutes && todo.text.trim() !== ""}
        checkboxDisabled={todo.text.trim() === ""}
        completed={completed}
        dragHandleProps={getDragHandleProps(todo, completed, canReorder)}
        isDragging={isDragging}
        isDurationEditing={editingDurationTodoId === todo.id}
        isMenuOpen={openMenuId === todo.id}
        item={todo}
        lineRef={(element) => {
          if (!isDragging) {
            rowRefs.current[todo.id] = element;
          }
        }}
        menuAriaLabel="Task actions"
        menuLeadingItems={(
          <>
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
                {!sourceThread && todo.text.trim() !== "" ? (
                  <button
                    type="button"
                    className="task-line-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      setMenuDateAction(null);
                      setMenuThreadTodoId(todo.id);
                    }}
                  >
                    <Layers size={15} />
                    <span>Add to thread</span>
                  </button>
                ) : null}
          </>
        )}
        menuMeta={otherDates.length > 0 ? (
          <div className="task-line-menu-meta">
            Also in {otherDates.join(", ")}
          </div>
        ) : null}
        menuRef={(element) => {
          menuRefs.current[todo.id] = element;
        }}
        onCompletedChange={(checked) => updateTodo(todo.sourceDate, todo.id, { completed: checked })}
        onDelete={() => {
          deleteTodo(todo.sourceDate, todo.id);
          setOpenMenuId(null);
          setMenuDateAction(null);
        }}
        onDurationChange={(durationMinutes) => updateTodo(todo.sourceDate, todo.id, { durationMinutes })}
        onDurationEditEnd={() => setEditingDurationTodoId((current) => (current === todo.id ? null : current))}
        onDurationEnter={handleAddTodo}
        onMenuToggle={() => {
          if (consumeSuppressedClick(todo.id)) {
            return;
          }

          setOpenThreadMenuId(null);
          setOpenMenuId((current) => (current === todo.id ? null : todo.id));
          setMenuDateAction(null);
        }}
        onRequestEstimate={() => {
          setOpenMenuId(null);
          setMenuDateAction(null);
          setEditingDurationTodoId(todo.id);
        }}
        onTextChange={(text) => updateTodo(todo.sourceDate, todo.id, { text })}
        onTextKeyDown={(event, itemId, value, previousId) => handleTodoKeyDown(event, itemId, todo.sourceDate, value, previousId)}
        pendingFocusRef={pendingFocusRef}
        previousItemId={previousTodoId}
        trailingContent={sourceThread ? (
          <div
            className="date-task-thread-menu"
            ref={(element) => {
              threadMenuRefs.current[todo.id] = element;
            }}
          >
            <button
              type="button"
              className="thread-task-schedule-indicator date-task-thread-indicator"
              aria-label={`Show thread for ${todo.text || "this task"}`}
              title={`In ${sourceThread.title || "Untitled thread"}`}
              aria-expanded={openThreadMenuId === todo.id}
              onClick={() => {
                setOpenMenuId(null);
                setMenuDateAction(null);
                setOpenThreadMenuId((current) => (current === todo.id ? null : todo.id));
              }}
            >
              <Layers size={15} />
            </button>
            {openThreadMenuId === todo.id ? (
              <div className="date-task-thread-popover" role="menu" aria-label="Thread">
                <Link href={`/thread?threadId=${sourceThread.id}`} className="date-task-thread-link" role="menuitem">
                  {sourceThread.title || "Untitled thread"}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      />
    );
  };

  const renderTodoRow = (todo: TodoItem, previousTodoId?: string, completed = false) => {
    const isDragging = dragState?.itemId === todo.id;

    return (
      <div
        key={todo.id}
        className={`task-line-slot${isDragging ? " dragging" : ""}`}
        style={
          isDragging && dragState
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
  const threadActionTodo = menuThreadTodoId
    ? visibleTodos.find((todo) => todo.id === menuThreadTodoId) ?? null
    : null;
  const draggedTodo = dragState
    ? visibleTodos.find((todo) => todo.id === dragState.itemId) ?? null
    : null;
  const draggedTodoPreviousId = draggedTodo
    ? (dragState?.completed ? completedTodos : openTodos)[
        (dragState?.completed ? completedTodos : openTodos).findIndex((todo) => todo.id === draggedTodo.id) - 1
      ]?.id
    : undefined;

  return (
    <>
      <div className="app-shell">
        <PageHeader
          title="Tasks"
          icon={<CheckSquare2 size={30} color="var(--accent-color)" />}
        />

        <DateNavigator date={selectedDate} onChange={setSelectedDate} dateProgress={dateProgress} />

        {selectedDate === "backlog" ? (
          <BacklogTaskList onSelectDate={setSelectedDate} />
        ) : (
          <section
            className="card task-list-card"
            ref={taskListCardRef}
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
                  ref={completedItemsRef}
                >
                  {completedTodos.map((todo, index) => renderTodoRow(todo, completedTodos[index - 1]?.id, true))}
                </div>
              </div>
            ) : null}

            {dragState && draggedTodo ? (
              <div
                className="task-drag-overlay"
                style={dragOverlayStyle}
              >
                {renderTodoContent(draggedTodo, draggedTodoPreviousId, dragState.completed, true)}
              </div>
            ) : null}
          </section>
        )}
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
      {threadActionTodo ? (
        <div
          className="task-action-datepicker-overlay"
          onClick={() => setMenuThreadTodoId(null)}
        >
          <div
            className="datepicker-popup task-action-thread-picker-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-thread-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="datepicker-modal-header">
              <div id="task-thread-picker-title" className="datepicker-modal-title">Add Task To Thread</div>
              <button
                type="button"
                className="datepicker-modal-close"
                aria-label="Cancel"
                onClick={() => setMenuThreadTodoId(null)}
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

export default function TasksPage() {
  return (
    <ClientReady>
      <TasksScreen />
    </ClientReady>
  );
}
