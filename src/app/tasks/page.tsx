"use client";

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Plus, CopyPlus, X, CheckSquare2 } from "lucide-react";
import ClientReady from "@/components/ClientReady";
import DateNavigator from "@/components/DateNavigator";
import PageHeader from "@/components/PageHeader";
import { useTodoay } from "@/lib/store";

function TasksScreen() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(today);
  const pendingFocusRef = useRef<{ id: string; mode: "selectAll" | "cursorEnd" } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { ready, addTodo, updateTodo, deleteTodo, copyTodoToDate, getVisibleTodos } = useTodoay();

  const visibleTodos = useMemo(() => getVisibleTodos(selectedDate, today), [getVisibleTodos, selectedDate, today]);
  const openTodos = visibleTodos.filter((item) => !item.completed);
  const completedTodos = visibleTodos.filter((item) => item.completed);
  const canCopyOpenToToday = selectedDate !== today && openTodos.length > 0;

  const handleAddTodo = () => {
    const nextTodoId = addTodo(selectedDate);
    pendingFocusRef.current = { id: nextTodoId, mode: "selectAll" };
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
        {canCopyOpenToToday ? (
          <div className="task-card-toolbar">
            <button
              className="btn-soft"
              onClick={() => openTodos.forEach((todo) => copyTodoToDate(todo.sourceDate, todo.id, today))}
            >
              <CopyPlus size={16} /> Copy open tasks to today
            </button>
          </div>
        ) : null}

        <div className="task-list">
          {openTodos.length === 0 ? (
            <div className="empty-state task-empty-state">No open tasks for this day.</div>
          ) : (
            openTodos.map((todo, index) => (
              <div key={todo.id} className="task-line">
                <input
                  className="todo-checkbox"
                  type="checkbox"
                  disabled={todo.text.trim() === ""}
                  checked={todo.completed}
                  onChange={(event) => updateTodo(todo.sourceDate, todo.id, { completed: event.target.checked })}
                />
                <input
                  className="task-text-input"
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
                  onKeyDown={(event) => handleTodoKeyDown(event, todo.id, todo.sourceDate, todo.text, openTodos[index - 1]?.id)}
                  onChange={(event) => updateTodo(todo.sourceDate, todo.id, { text: event.target.value })}
                />
                <button className="task-line-action" title="Remove item" onClick={() => deleteTodo(todo.sourceDate, todo.id)}>
                  <X size={16} />
                </button>
              </div>
            ))
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
              {completedTodos.map((todo, index) => (
                <div key={todo.id} className="task-line completed">
                  <input
                    className="todo-checkbox"
                    type="checkbox"
                    disabled={todo.text.trim() === ""}
                    checked={todo.completed}
                    onChange={(event) => updateTodo(todo.sourceDate, todo.id, { completed: event.target.checked })}
                  />
                  <input
                    className="task-text-input completed"
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
                    onKeyDown={(event) => handleTodoKeyDown(event, todo.id, todo.sourceDate, todo.text, completedTodos[index - 1]?.id)}
                    onChange={(event) => updateTodo(todo.sourceDate, todo.id, { text: event.target.value })}
                  />
                  <button className="task-line-action" title="Remove item" onClick={() => deleteTodo(todo.sourceDate, todo.id)}>
                    <X size={16} />
                  </button>
                </div>
              ))}
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
