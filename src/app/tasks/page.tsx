"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { Plus, MoreHorizontal, Trash2, Link2, CheckSquare2 } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import DateNavigator from "@/components/DateNavigator";
import PageHeader from "@/components/PageHeader";
import type { TodoItem } from "@/lib/types";
import { useTodoay } from "@/lib/store";

function TasksScreen() {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentYear = new Date().getFullYear();
  const [selectedDate, setSelectedDate] = useState(today);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const pendingFocusRef = useRef<{ id: string; mode: "selectAll" | "cursorEnd" } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { ready, state, addTodo, updateTodo, deleteTodo, cloneTodoReferenceToDate, getVisibleTodos } = useTodoay();

  const visibleTodos = useMemo(() => getVisibleTodos(selectedDate, today), [getVisibleTodos, selectedDate, today]);
  const openTodos = visibleTodos.filter((item) => !item.completed);
  const completedTodos = visibleTodos.filter((item) => item.completed);

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

  const handleAddTodo = () => {
    const nextTodoId = addTodo(selectedDate);
    pendingFocusRef.current = { id: nextTodoId, mode: "selectAll" };
  };

  const handleCloneToToday = (todo: TodoItem) => {
    cloneTodoReferenceToDate(todo.sourceDate, todo.id, today);
    setOpenMenuId(null);
  };

  const renderTodoRow = (todo: TodoItem, previousTodoId?: string, completed = false) => {
    const alreadyLinkedToToday = (state.todosByDate[today] ?? []).some(
      (item) => item.referenceId === todo.referenceId,
    );
    const showCloneToToday = todo.sourceDate !== today;
    const cloneDisabled = alreadyLinkedToToday;
    const otherDates = Object.entries(state.todosByDate)
      .filter(([date, items]) => date !== todo.sourceDate && items.some((item) => item.referenceId === todo.referenceId))
      .map(([date]) => {
        const parsedDate = parseISO(date);
        let label: string;
        if (isToday(parsedDate)) {
          label = "Today";
        } else if (isYesterday(parsedDate)) {
          label = "Yesterday";
        } else if (isTomorrow(parsedDate)) {
          label = "Tomorrow";
        } else {
          label = parsedDate.getFullYear() === currentYear
            ? format(parsedDate, "MMM d")
            : format(parsedDate, "MMM d, yyyy");
        }
        return { value: date, label };
      })
      .sort((left, right) => left.value.localeCompare(right.value))
      .map(({ label }) => label);

    return (
      <div key={todo.id} className={`task-line${completed ? " completed" : ""}`}>
        <input
          className="todo-checkbox"
          type="checkbox"
          disabled={todo.text.trim() === ""}
          checked={todo.completed}
          onChange={(event) => updateTodo(todo.sourceDate, todo.id, { completed: event.target.checked })}
        />
        <input
          className={`task-text-input${completed ? " completed" : ""}`}
          ref={(element) => {
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
            title="Open task menu"
            aria-label="Open task menu"
            aria-expanded={openMenuId === todo.id}
            onClick={() => setOpenMenuId((current) => (current === todo.id ? null : todo.id))}
          >
            <MoreHorizontal size={16} />
          </button>
          {openMenuId === todo.id ? (
            <div className="task-line-menu-popover" role="menu" aria-label="Task actions">
              {showCloneToToday ? (
                <button
                  className="task-line-menu-item"
                  role="menuitem"
                  disabled={cloneDisabled}
                  onClick={() => handleCloneToToday(todo)}
                >
                  <Link2 size={15} />
                  <span>{cloneDisabled ? "Already in Today" : "Clone to Today"}</span>
                </button>
              ) : null}
              <button
                className="task-line-menu-item danger"
                role="menuitem"
                onClick={() => {
                  deleteTodo(todo.sourceDate, todo.id);
                  setOpenMenuId(null);
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

  const handleTodoKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
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

  return (
    <div className="app-shell">
      <PageHeader
        title="Tasks"
        icon={<CheckSquare2 size={30} color="var(--accent-color)" />}
      />

      <DateNavigator date={selectedDate} onChange={setSelectedDate} />

      <section className="card task-list-card">
        <div className="task-list">
          {openTodos.length === 0 ? (
            <div className="empty-state task-empty-state">No open tasks for this day.</div>
          ) : (
            openTodos.map((todo, index) => renderTodoRow(todo, openTodos[index - 1]?.id))
          )}

          <button className="task-add-row" onClick={handleAddTodo}>
            <Plus size={18} />
            <span>Add item</span>
          </button>
        </div>

        {completedTodos.length > 0 ? (
          <div className="task-completed-section">
            <div className="task-section-label">{completedTodos.length} Completed {completedTodos.length === 1 ? "item" : "items"}</div>
            <div className="task-list">
              {completedTodos.map((todo, index) => renderTodoRow(todo, completedTodos[index - 1]?.id, true))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function TasksPage() {
  return (
    <ClientReady>
      <TasksScreen />
    </ClientReady>
  );
}
