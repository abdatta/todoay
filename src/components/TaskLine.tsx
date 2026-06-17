"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GripVertical, Timer, Trash2 } from "lucide-react";

export type TaskLineItem = {
  id: string;
  text: string;
  durationMinutes?: number;
  completed: boolean;
};

export type TaskLineFocusRequest = {
  id: string;
  mode: "selectAll" | "cursorEnd";
};

type TaskLineDragState = {
  itemId: string;
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

type ReorderPlacement = "before" | "after";
type TaskLineDragHandleProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
};

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 8;

export function autoResizeTaskTextarea(element: HTMLTextAreaElement | null) {
  if (!element) {
    return;
  }

  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getTaskDurationTone(durationMinutes: number | undefined) {
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

export function useTaskLineReorder<T extends TaskLineItem>({
  openItems,
  completedItems,
  onReorder,
  onBeforeDragStart,
}: {
  openItems: T[];
  completedItems: T[];
  onReorder: (itemId: string, targetItemId: string, placement: ReorderPlacement) => void;
  onBeforeDragStart?: () => void;
}) {
  const [dragState, setDragState] = useState<TaskLineDragState | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardRef = useRef<HTMLElement | null>(null);
  const openItemsRef = useRef<HTMLDivElement | null>(null);
  const completedItemsRef = useRef<HTMLDivElement | null>(null);
  const longPressRef = useRef<{ itemId: string; pointerId: number; timeoutId: number | null; startX: number; startY: number } | null>(null);
  const suppressClickRef = useRef<string | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current?.timeoutId) {
      window.clearTimeout(longPressRef.current.timeoutId);
    }
    longPressRef.current = null;
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const moveDraggedItem = useCallback((itemId: string, completed: boolean, clientY: number) => {
    const sectionItems = completed ? completedItems : openItems;
    if (sectionItems.length < 2) {
      return;
    }

    let closestItemId: string | null = null;
    let closestPlacement: ReorderPlacement = "before";
    let closestDistance = Number.POSITIVE_INFINITY;

    sectionItems.forEach((candidate) => {
      const element = rowRefs.current[candidate.id];
      if (!element || candidate.id === itemId) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const distance = Math.abs(clientY - midpoint);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestItemId = candidate.id;
        closestPlacement = clientY < midpoint ? "before" : "after";
      }
    });

    if (closestItemId) {
      onReorder(itemId, closestItemId, closestPlacement);
    }
  }, [completedItems, onReorder, openItems]);

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
      moveDraggedItem(dragState.itemId, dragState.completed, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }
        suppressClickRef.current = current.itemId;
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
  }, [clearLongPress, dragState, moveDraggedItem]);

  const getDragHandleProps = useCallback((item: T, completed: boolean, canReorder: boolean) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canReorder || !event.isPrimary || event.button !== 0) {
        return;
      }

      clearLongPress();
      longPressRef.current = {
        itemId: item.id,
        pointerId: event.pointerId,
        timeoutId: window.setTimeout(() => {
          const rowRect = rowRefs.current[item.id]?.getBoundingClientRect();
          const cardRect = cardRef.current?.getBoundingClientRect();
          const sectionRect = (completed ? completedItemsRef.current : openItemsRef.current)?.getBoundingClientRect();

          onBeforeDragStart?.();
          setDragState({
            itemId: item.id,
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
          suppressClickRef.current = item.id;
        }, LONG_PRESS_MS),
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const pendingLongPress = longPressRef.current;

      if (!pendingLongPress || pendingLongPress.itemId !== item.id || pendingLongPress.pointerId !== event.pointerId) {
        return;
      }

      if (
        Math.abs(event.clientX - pendingLongPress.startX) > LONG_PRESS_MOVE_TOLERANCE ||
        Math.abs(event.clientY - pendingLongPress.startY) > LONG_PRESS_MOVE_TOLERANCE
      ) {
        clearLongPress();
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const pendingLongPress = longPressRef.current;
      if (
        pendingLongPress &&
        pendingLongPress.itemId === item.id &&
        pendingLongPress.pointerId === event.pointerId
      ) {
        clearLongPress();
      }
    },
    onPointerCancel: () => {
      clearLongPress();
      setDragState((current) => (current?.itemId === item.id ? null : current));
    },
  }), [clearLongPress, onBeforeDragStart]);

  const consumeSuppressedClick = useCallback((itemId: string) => {
    if (suppressClickRef.current !== itemId) {
      return false;
    }

    suppressClickRef.current = null;
    return true;
  }, []);

  const dragOverlayStyle: CSSProperties | undefined = dragState
    ? {
        left: `${dragState.originLeft}px`,
        top: `${dragState.originTop}px`,
        width: `${dragState.width}px`,
        minHeight: `${dragState.height}px`,
        transform: `translate(${
          clamp(
            dragState.currentX - dragState.startX,
            dragState.boundsLeft - dragState.originLeft,
            dragState.boundsLeft + Math.max(0, dragState.boundsWidth - dragState.width) - dragState.originLeft,
          )
        }px, ${
          clamp(
            dragState.currentY - dragState.startY,
            dragState.boundsTop - dragState.originTop,
            dragState.boundsTop + Math.max(0, dragState.boundsHeight - dragState.height) - dragState.originTop,
          )
        }px) scale(1.02)`,
      }
    : undefined;

  return {
    cardRef,
    completedItemsRef,
    consumeSuppressedClick,
    dragOverlayStyle,
    dragState,
    getDragHandleProps,
    openItemsRef,
    rowRefs,
  };
}

export function TaskLine<T extends TaskLineItem>({
  actionAriaLabel,
  actionDisabled,
  actionTitle,
  canRequestEstimate,
  checkboxDisabled,
  completed,
  dragHandleProps,
  isDragging = false,
  isDurationEditing = false,
  isMenuOpen,
  item,
  lineRef,
  menuAriaLabel,
  menuLeadingItems,
  menuMeta,
  menuRef,
  onCompletedChange,
  onDelete,
  onDurationChange,
  onDurationEditEnd,
  onDurationEnter,
  onMenuToggle,
  onRequestEstimate,
  onTextChange,
  onTextKeyDown,
  pendingFocusRef,
  previousItemId,
  readOnly = false,
  trailingContent,
}: {
  actionAriaLabel: string;
  actionDisabled?: boolean;
  actionTitle: string;
  canRequestEstimate: boolean;
  checkboxDisabled: boolean;
  completed: boolean;
  dragHandleProps?: TaskLineDragHandleProps;
  isDragging?: boolean;
  isDurationEditing?: boolean;
  isMenuOpen: boolean;
  item: T;
  lineRef?: (element: HTMLDivElement | null) => void;
  menuAriaLabel: string;
  menuLeadingItems?: ReactNode;
  menuMeta?: ReactNode;
  menuRef: (element: HTMLDivElement | null) => void;
  onCompletedChange: (completed: boolean) => void;
  onDelete: () => void;
  onDurationChange: (durationMinutes: number | undefined) => void;
  onDurationEditEnd: () => void;
  onDurationEnter: () => void;
  onMenuToggle: () => void;
  onRequestEstimate: () => void;
  onTextChange: (text: string) => void;
  onTextKeyDown: (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    itemId: string,
    value: string,
    previousItemId?: string,
  ) => void;
  pendingFocusRef: MutableRefObject<TaskLineFocusRequest | null>;
  previousItemId?: string;
  readOnly?: boolean;
  trailingContent?: ReactNode;
}) {
  const durationInputRef = useRef<HTMLInputElement | null>(null);
  const shouldShowDuration = item.text.trim() !== "" && (Boolean(item.durationMinutes) || isDurationEditing);

  useEffect(() => {
    if (isDurationEditing) {
      durationInputRef.current?.focus();
    }
  }, [isDurationEditing]);

  return (
    <div
      className={`task-line${completed ? " completed" : ""}${isDragging ? " dragging" : ""}`}
      ref={lineRef}
    >
      <input
        className="todo-checkbox"
        type="checkbox"
        disabled={checkboxDisabled}
        checked={item.completed}
        onChange={(event) => onCompletedChange(event.target.checked)}
      />
      <div className="thread-task-copy">
        <textarea
          className={`task-text-input${completed ? " completed" : ""}`}
          ref={(element) => {
            autoResizeTaskTextarea(element);
            if (element && pendingFocusRef.current?.id === item.id) {
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
          value={item.text}
          readOnly={readOnly}
          onKeyDown={(event) => onTextKeyDown(event, item.id, item.text, previousItemId)}
          onInput={(event: FormEvent<HTMLTextAreaElement>) => autoResizeTaskTextarea(event.currentTarget)}
          onChange={(event) => onTextChange(event.target.value)}
        />
      </div>
      {shouldShowDuration ? (
        <input
          className={`task-duration-chip tone-${getTaskDurationTone(item.durationMinutes)}`}
          ref={durationInputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Estimated task duration in minutes"
          title="Estimated minutes"
          placeholder="min"
          value={item.durationMinutes ?? ""}
          readOnly={readOnly}
          disabled={readOnly}
          onBlur={() => {
            if (!item.durationMinutes) {
              onDurationEditEnd();
            }
          }}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 3);
            onDurationChange(digits ? Number(digits) : undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onDurationEditEnd();
              onDurationEnter();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onDurationEditEnd();
              event.currentTarget.blur();
            }
          }}
        />
      ) : null}
      {trailingContent}
      <div className="task-line-menu" ref={menuRef}>
        <button
          type="button"
          className="task-line-action"
          title={actionTitle}
          aria-label={actionAriaLabel}
          aria-expanded={isMenuOpen}
          disabled={actionDisabled}
          onClick={onMenuToggle}
          {...dragHandleProps}
        >
          <GripVertical size={16} />
        </button>
        {isMenuOpen && !readOnly ? (
          <div className="task-line-menu-popover" role="menu" aria-label={menuAriaLabel}>
            {menuLeadingItems}
            {canRequestEstimate ? (
              <button
                type="button"
                className="task-line-menu-item"
                role="menuitem"
                onClick={onRequestEstimate}
              >
                <Timer size={15} />
                <span>Add estimate</span>
              </button>
            ) : null}
            <button
              type="button"
              className="task-line-menu-item danger"
              role="menuitem"
              onClick={onDelete}
            >
              <Trash2 size={15} />
              <span>Delete</span>
            </button>
            {menuMeta}
          </div>
        ) : null}
      </div>
    </div>
  );
}
