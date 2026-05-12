"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  format,
  parseISO,
  isToday,
  isYesterday,
  isTomorrow,
  isValid,
  startOfMonth,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addDays,
} from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

const DAY_PROGRESS_RADIUS = 46;
const DAY_PROGRESS_CENTER = 50;
const MONTH_GESTURE_SNAP_MS = 180;
const POINTER_DRAG_CLICK_THRESHOLD = 8;
const FALLBACK_MONTH_PAGE_HEIGHT = 264;
const WHEEL_GESTURE_DISTANCE_MULTIPLIER = 1.4;
const CALENDAR_VISIBLE_WEEKS = 6;
const CALENDAR_COLUMN_GAP = 4;
const CALENDAR_ROW_GAP = 4;

type DateProgressMap = Record<string, {
  completed: number;
  total: number;
  showTrackWhenSelected?: boolean;
  useTrackColorValue?: boolean;
}>;

interface DatePickerPopupContentProps {
  selectedDate: string;
  onChange: (date: string) => void;
  displayDates?: string[];
  dateProgress?: DateProgressMap;
  viewDate: Date;
  onViewDateChange: (date: Date) => void;
  popupClassName?: string;
  title?: string;
  onCancel?: () => void;
  showBacklogAction?: boolean;
}

interface CustomDatePickerProps {
  selectedDate: string;
  onChange: (date: string) => void;
  displayDates?: string[];
  dateProgress?: DateProgressMap;
  disabled?: boolean;
}

type CalendarWeek = {
  key: string;
  days: Date[];
};

type MonthSnapPoint = {
  delta: -1 | 0 | 1;
  offset: number;
};

interface DatePickerWeekTrackProps {
  weeks: CalendarWeek[];
  activeMonthDate: Date;
  selectedDate: string;
  onChange: (date: string) => void;
  displayDates: string[];
  dateProgress: DateProgressMap;
  hasRestrictedDates: boolean;
  suppressDayClickRef: React.MutableRefObject<boolean>;
}

function polarToCartesian(angleDegrees: number) {
  const angleRadians = (angleDegrees * Math.PI) / 180;

  return {
    x: DAY_PROGRESS_CENTER + DAY_PROGRESS_RADIUS * Math.cos(angleRadians),
    y: DAY_PROGRESS_CENTER + DAY_PROGRESS_RADIUS * Math.sin(angleRadians),
  };
}

function describeCounterClockwiseArc(completedRatio: number) {
  const startAngle = -90;
  const endAngle = startAngle - completedRatio * 360;
  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);
  const largeArcFlag = completedRatio > 0.5 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${DAY_PROGRESS_RADIUS} ${DAY_PROGRESS_RADIUS} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCalendarDays(monthDate: Date) {
  const monthStart = startOfMonth(monthDate);
  const startDate = new Date(monthStart);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  return Array.from({ length: 42 }, (_, index) => addDays(startDate, index));
}

function getCalendarWeeks(monthDate: Date) {
  const days = getCalendarDays(monthDate);
  const weeks: CalendarWeek[] = [];

  for (let index = 0; index < days.length; index += 7) {
    const weekDays = days.slice(index, index + 7);
    weeks.push({
      key: format(weekDays[0], "yyyy-MM-dd"),
      days: weekDays,
    });
  }

  return weeks;
}

function getNearestSnapPoint(offset: number, snapPoints: MonthSnapPoint[]) {
  return snapPoints.reduce((nearest, snapPoint) => (
    Math.abs(offset - snapPoint.offset) < Math.abs(offset - nearest.offset)
      ? snapPoint
      : nearest
  ), snapPoints[0]);
}

function DatePickerWeekTrack({
  weeks,
  activeMonthDate,
  selectedDate,
  onChange,
  displayDates,
  dateProgress,
  hasRestrictedDates,
  suppressDayClickRef,
}: DatePickerWeekTrackProps) {
  const activeMonthStart = startOfMonth(activeMonthDate);

  return (
    <div className="datepicker-week-track">
      {weeks.map((week) => (
        <div className="datepicker-week-row" key={week.key}>
          {week.days.map((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        const isInActiveMonth = isSameMonth(day, activeMonthStart);
        const isSelected = isInActiveMonth && selectedDate === dayStr;
        const isTodayDate = isInActiveMonth && isSameDay(day, new Date());
        const isAvailable = !hasRestrictedDates || displayDates.includes(dayStr);
        const progress = dateProgress[dayStr];
        const hasItems = Boolean(progress && progress.total > 0);
        const completedRatio = hasItems ? progress.completed / progress.total : 0;
        const showTrackWhenSelected = Boolean(progress?.showTrackWhenSelected);
        const useTrackColorValue = Boolean(progress?.useTrackColorValue);
        const progressArc = completedRatio > 0 && completedRatio < 1
          ? describeCounterClockwiseArc(completedRatio)
          : "";

        return (
          <button
            key={day.toISOString()}
            type="button"
            tabIndex={isInActiveMonth ? 0 : -1}
            onClick={(event) => {
              if (!isInActiveMonth) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }

              if (suppressDayClickRef.current) {
                event.preventDefault();
                event.stopPropagation();
                suppressDayClickRef.current = false;
                return;
              }

              onChange(dayStr);
            }}
            className={`datepicker-day ${!isInActiveMonth ? "datepicker-day-outside" : ""} ${isSelected ? "datepicker-day-selected" : ""} ${isTodayDate && !isSelected ? "datepicker-day-today" : ""} ${!isAvailable ? "datepicker-day-unavailable" : ""} ${hasItems ? "datepicker-day-has-items" : ""} ${isSelected && showTrackWhenSelected && completedRatio === 0 ? "datepicker-day-selected-track-visible" : ""}`}
          >
            {hasItems ? (
              <svg
                className="datepicker-day-progress"
                viewBox="0 0 100 100"
                aria-hidden="true"
              >
                <circle
                  className="datepicker-day-progress-track"
                  cx="50"
                  cy="50"
                  r={DAY_PROGRESS_RADIUS}
                />
                {completedRatio >= 1 ? (
                  <circle
                    className={`datepicker-day-progress-value ${useTrackColorValue ? "datepicker-day-progress-value-track-tone" : ""}`}
                    cx="50"
                    cy="50"
                    r={DAY_PROGRESS_RADIUS}
                  />
                ) : completedRatio > 0 ? (
                  <path
                    className={`datepicker-day-progress-value ${useTrackColorValue ? "datepicker-day-progress-value-track-tone" : ""}`}
                    d={progressArc}
                  />
                ) : null}
              </svg>
            ) : null}
            {format(day, "d")}
          </button>
        );
          })}
        </div>
      ))}
    </div>
  );
}

export function DatePickerPopupContent({
  selectedDate,
  onChange,
  displayDates = [],
  dateProgress = {},
  viewDate,
  onViewDateChange,
  popupClassName,
  title,
  onCancel,
  showBacklogAction = false,
}: DatePickerPopupContentProps) {
  const hasRestrictedDates = displayDates.length > 0;
  const gridViewportRef = useRef<HTMLDivElement>(null);
  const viewDateRef = useRef(viewDate);
  const gestureOffsetRef = useRef(0);
  const gestureStartYRef = useRef(0);
  const gestureStartOffsetRef = useRef(0);
  const gesturePointerIdRef = useRef<number | null>(null);
  const snapTimeoutRef = useRef<number | null>(null);
  const wheelSnapTimeoutRef = useRef<number | null>(null);
  const suppressDayClickRef = useRef(false);
  const [gestureOffset, setGestureOffset] = useState(0);
  const [isDraggingMonth, setIsDraggingMonth] = useState(false);
  const [isSnappingMonth, setIsSnappingMonth] = useState(false);
  const [monthPageWidth, setMonthPageWidth] = useState(FALLBACK_MONTH_PAGE_HEIGHT * 7 / 6);
  const dayCellSize = (monthPageWidth - CALENDAR_COLUMN_GAP * 6) / 7;
  const monthPageHeight = dayCellSize * CALENDAR_VISIBLE_WEEKS
    + CALENDAR_ROW_GAP * (CALENDAR_VISIBLE_WEEKS - 1);
  const monthRowHeight = dayCellSize + CALENDAR_ROW_GAP;

  const calendarPager = useMemo(() => {
    const monthDates = [
      { date: subMonths(viewDate, 1), delta: -1 as const },
      { date: viewDate, delta: 0 as const },
      { date: addMonths(viewDate, 1), delta: 1 as const },
    ];
    const weeks: CalendarWeek[] = [];
    const seenWeekKeys = new Set<string>();
    const monthStartWeekKeys = new Map<-1 | 0 | 1, string>();

    monthDates.forEach(({ date, delta }) => {
      const monthWeeks = getCalendarWeeks(date);
      monthStartWeekKeys.set(delta, monthWeeks[0].key);

      monthWeeks.forEach((week) => {
        if (!seenWeekKeys.has(week.key)) {
          seenWeekKeys.add(week.key);
          weeks.push(week);
        }
      });
    });

    const weekIndexes = new Map(weeks.map((week, index) => [week.key, index]));
    const currentWeekIndex = weekIndexes.get(monthStartWeekKeys.get(0) ?? "") ?? 0;
    const prevWeekIndex = weekIndexes.get(monthStartWeekKeys.get(-1) ?? "") ?? currentWeekIndex;
    const nextWeekIndex = weekIndexes.get(monthStartWeekKeys.get(1) ?? "") ?? currentWeekIndex;

    return {
      weeks,
      currentWeekIndex,
      snapPoints: [
        {
          delta: -1 as const,
          offset: (currentWeekIndex - prevWeekIndex) * monthRowHeight,
        },
        {
          delta: 0 as const,
          offset: 0,
        },
        {
          delta: 1 as const,
          offset: -(nextWeekIndex - currentWeekIndex) * monthRowHeight,
        },
      ],
    };
  }, [monthRowHeight, viewDate]);

  const minGestureOffset = Math.min(...calendarPager.snapPoints.map(({ offset }) => offset));
  const maxGestureOffset = Math.max(...calendarPager.snapPoints.map(({ offset }) => offset));
  const targetSnapPoint = getNearestSnapPoint(gestureOffset, calendarPager.snapPoints);
  const targetViewDate = addMonths(viewDate, targetSnapPoint.delta);
  const weekTrackOffset = -(calendarPager.currentWeekIndex * monthRowHeight) + gestureOffset;
  const calendarGestureStyle = {
    "--datepicker-column-gap": `${CALENDAR_COLUMN_GAP}px`,
    "--datepicker-row-gap": `${CALENDAR_ROW_GAP}px`,
    "--datepicker-day-size": `${dayCellSize}px`,
    "--datepicker-week-row-height": `${monthRowHeight}px`,
  } as React.CSSProperties;
  const weekTrackStyle = {
    transform: `translate3d(0, ${weekTrackOffset}px, 0)`,
  } as React.CSSProperties;

  useEffect(() => {
    viewDateRef.current = viewDate;
  }, [viewDate]);

  useEffect(() => {
    const viewport = gridViewportRef.current;
    if (!viewport) {
      return;
    }

    const updateMonthPageHeight = () => {
      setMonthPageWidth(viewport.clientWidth || FALLBACK_MONTH_PAGE_HEIGHT * 7 / 6);
    };

    updateMonthPageHeight();

    const resizeObserver = new ResizeObserver(updateMonthPageHeight);
    resizeObserver.observe(viewport);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const clearGestureTimers = useCallback(() => {
    if (snapTimeoutRef.current !== null) {
      window.clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = null;
    }

    if (wheelSnapTimeoutRef.current !== null) {
      window.clearTimeout(wheelSnapTimeoutRef.current);
      wheelSnapTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearGestureTimers();
    };
  }, [clearGestureTimers]);

  const updateGestureOffset = useCallback((nextOffset: number) => {
    const clampedOffset = clamp(nextOffset, minGestureOffset, maxGestureOffset);
    gestureOffsetRef.current = clampedOffset;
    setGestureOffset(clampedOffset);
  }, [maxGestureOffset, minGestureOffset]);

  const finishMonthGesture = useCallback((offset = gestureOffsetRef.current) => {
    const snapPoint = getNearestSnapPoint(offset, calendarPager.snapPoints);
    const monthDelta = snapPoint.delta;

    clearGestureTimers();
    gestureOffsetRef.current = snapPoint.offset;
    setIsSnappingMonth(true);
    setGestureOffset(snapPoint.offset);

    snapTimeoutRef.current = window.setTimeout(() => {
      if (monthDelta !== 0) {
        onViewDateChange(addMonths(viewDateRef.current, monthDelta));
      }

      gestureOffsetRef.current = 0;
      setGestureOffset(0);
      setIsSnappingMonth(false);
      setIsDraggingMonth(false);
      gesturePointerIdRef.current = null;
      suppressDayClickRef.current = false;
    }, MONTH_GESTURE_SNAP_MS);
  }, [calendarPager.snapPoints, clearGestureTimers, onViewDateChange]);

  const resetMonthGesture = useCallback(() => {
    clearGestureTimers();
    gestureOffsetRef.current = 0;
    setGestureOffset(0);
    setIsDraggingMonth(false);
    setIsSnappingMonth(false);
    gesturePointerIdRef.current = null;
  }, [clearGestureTimers]);

  const handlePrevMonth = (event: React.MouseEvent) => {
    event.stopPropagation();
    resetMonthGesture();
    onViewDateChange(subMonths(viewDate, 1));
  };

  const handleNextMonth = (event: React.MouseEvent) => {
    event.stopPropagation();
    resetMonthGesture();
    onViewDateChange(addMonths(viewDate, 1));
  };

  let oldestDateStr = "";
  let oldestDateLabel = "Oldest";
  if (hasRestrictedDates) {
    oldestDateStr = displayDates.reduce(
      (min, current) => (current < min ? current : min),
      displayDates[0],
    );
    if (isValid(parseISO(oldestDateStr))) {
      const oldestDate = parseISO(oldestDateStr);
      const isCurrentYear = oldestDate.getFullYear() === new Date().getFullYear();
      oldestDateLabel = format(oldestDate, isCurrentYear ? "MMM d" : "MMM d, yyyy");
    }
  }

  const handleOldest = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (oldestDateStr) {
      onChange(oldestDateStr);
    }
  };

  const handleToday = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(format(new Date(), "yyyy-MM-dd"));
  };

  const handleBacklog = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange("backlog");
  };

  const handleMonthPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    resetMonthGesture();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesturePointerIdRef.current = event.pointerId;
    gestureStartYRef.current = event.clientY;
    gestureStartOffsetRef.current = gestureOffsetRef.current;
    suppressDayClickRef.current = false;
    setIsDraggingMonth(true);
  };

  const handleMonthPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gesturePointerIdRef.current !== event.pointerId) {
      return;
    }

    const dragDistance = event.clientY - gestureStartYRef.current;
    if (Math.abs(dragDistance) > POINTER_DRAG_CLICK_THRESHOLD) {
      suppressDayClickRef.current = true;
    }

    updateGestureOffset(gestureStartOffsetRef.current + dragDistance);
  };

  const handleMonthPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gesturePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishMonthGesture();
  };

  const handleMonthWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    let normalizedDelta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      normalizedDelta *= 16;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      normalizedDelta *= monthPageHeight;
    }

    const wheelDistance = normalizedDelta * WHEEL_GESTURE_DISTANCE_MULTIPLIER;
    const nextOffset = clamp(
      gestureOffsetRef.current - wheelDistance,
      minGestureOffset,
      maxGestureOffset,
    );

    if (wheelSnapTimeoutRef.current !== null) {
      window.clearTimeout(wheelSnapTimeoutRef.current);
    }

    gestureOffsetRef.current = nextOffset;
    setIsSnappingMonth(false);
    setGestureOffset(nextOffset);

    wheelSnapTimeoutRef.current = window.setTimeout(() => {
      finishMonthGesture(nextOffset);
    }, 120);
  };

  return (
    <div className={`datepicker-popup${popupClassName ? ` ${popupClassName}` : ""}`}>
      {title ? (
        <div className="datepicker-modal-header">
          <div className="datepicker-modal-title">{title}</div>
          {onCancel ? (
            <button
              type="button"
              className="datepicker-modal-close"
              aria-label="Cancel"
              onClick={onCancel}
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="datepicker-header">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="btn-icon-clear datepicker-nav"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
        <div className="datepicker-month-year">{format(targetViewDate, "MMMM yyyy")}</div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="btn-icon-clear datepicker-nav"
          aria-label="Next month"
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      </div>

      <div
        className={`datepicker-calendar-gesture-area${isDraggingMonth ? " is-dragging" : ""}`}
        style={calendarGestureStyle}
        onWheel={handleMonthWheel}
        onPointerDown={handleMonthPointerDown}
        onPointerMove={handleMonthPointerMove}
        onPointerUp={handleMonthPointerEnd}
        onPointerCancel={handleMonthPointerEnd}
      >
        <div className="datepicker-week-days">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <div key={day} className="datepicker-week-day">
              {day}
            </div>
          ))}
        </div>

        <div className="datepicker-grid-viewport" ref={gridViewportRef}>
          <div
            className={`datepicker-month-track${isSnappingMonth ? " is-snapping" : ""}`}
            style={weekTrackStyle}
          >
            <DatePickerWeekTrack
              weeks={calendarPager.weeks}
              activeMonthDate={targetViewDate}
              selectedDate={selectedDate}
              onChange={onChange}
              displayDates={displayDates}
              dateProgress={dateProgress}
              hasRestrictedDates={hasRestrictedDates}
              suppressDayClickRef={suppressDayClickRef}
            />
          </div>
        </div>
      </div>

      <div className="datepicker-actions">
        {hasRestrictedDates ? (
          <button
            type="button"
            className="datepicker-action-btn"
            onClick={handleOldest}
            disabled={!oldestDateStr}
          >
            {oldestDateLabel}
          </button>
        ) : showBacklogAction ? (
          <button
            type="button"
            className="datepicker-action-btn"
            onClick={handleBacklog}
          >
            Backlog
          </button>
        ) : <span />}
        <button
          type="button"
          className="datepicker-action-btn"
          onClick={handleToday}
        >
          Today
        </button>
      </div>
    </div>
  );
}

export default function CustomDatePicker({
  selectedDate,
  onChange,
  displayDates = [],
  dateProgress = {},
  disabled,
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const initialViewDate =
    selectedDate && isValid(parseISO(selectedDate))
      ? parseISO(selectedDate)
      : new Date();
  const [viewDate, setViewDate] = useState<Date>(initialViewDate);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleToggle = () => {
    if (disabled) {
      return;
    }

    setIsOpen(!isOpen);
    if (!isOpen && selectedDate && isValid(parseISO(selectedDate))) {
      setViewDate(parseISO(selectedDate));
    }
  };

  let buttonText = "Select Date";
  if (selectedDate === "backlog") {
    buttonText = "Backlog";
  } else if (selectedDate && isValid(parseISO(selectedDate))) {
    const date = parseISO(selectedDate);
    if (isToday(date)) {
      buttonText = "Today";
    } else if (isYesterday(date)) {
      buttonText = "Yesterday";
    } else if (isTomorrow(date)) {
      buttonText = "Tomorrow";
    } else {
      buttonText = format(date, "EEEE, MMM d, yyyy");
    }
  } else if (selectedDate) {
    buttonText = "Invalid Date";
  }

  return (
    <div className="custom-datepicker" ref={popupRef}>
      <button
        type="button"
        className="datepicker-trigger"
        onClick={handleToggle}
        disabled={disabled}
      >
        {buttonText}
      </button>

      {isOpen ? (
        <DatePickerPopupContent
          selectedDate={selectedDate}
          onChange={(date) => {
            onChange(date);
            setIsOpen(false);
          }}
          displayDates={displayDates}
          dateProgress={dateProgress}
          viewDate={viewDate}
          onViewDateChange={setViewDate}
          showBacklogAction
        />
      ) : null}
    </div>
  );
}
