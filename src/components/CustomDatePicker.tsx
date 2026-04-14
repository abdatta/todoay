"use client";

import { useState, useRef, useEffect } from "react";
import {
  format,
  parseISO,
  isToday,
  isYesterday,
  isTomorrow,
  isValid,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

const DAY_PROGRESS_RADIUS = 46;
const DAY_PROGRESS_CENTER = 50;

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
}

interface CustomDatePickerProps {
  selectedDate: string;
  onChange: (date: string) => void;
  displayDates?: string[];
  dateProgress?: DateProgressMap;
  disabled?: boolean;
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
}: DatePickerPopupContentProps) {
  const hasRestrictedDates = displayDates.length > 0;

  const handlePrevMonth = (event: React.MouseEvent) => {
    event.stopPropagation();
    onViewDateChange(subMonths(viewDate, 1));
  };

  const handleNextMonth = (event: React.MouseEvent) => {
    event.stopPropagation();
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

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = new Date(monthStart);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const endDate = new Date(monthEnd);
  if (endDate.getDay() !== 6) {
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
  }

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

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
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
        <div className="datepicker-month-year">{format(viewDate, "MMMM yyyy")}</div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="btn-icon-clear datepicker-nav"
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      </div>

      <div className="datepicker-week-days">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div key={day} className="datepicker-week-day">
            {day}
          </div>
        ))}
      </div>

      <div className="datepicker-grid">
        {calendarDays.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const isSelected = selectedDate === dayStr;
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isTodayDate = isSameDay(day, new Date());
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
              onClick={() => onChange(dayStr)}
              className={`datepicker-day ${!isCurrentMonth ? "datepicker-day-outside" : ""} ${isSelected ? "datepicker-day-selected" : ""} ${isTodayDate && !isSelected ? "datepicker-day-today" : ""} ${!isAvailable ? "datepicker-day-unavailable" : ""} ${hasItems ? "datepicker-day-has-items" : ""} ${isSelected && showTrackWhenSelected && completedRatio === 0 ? "datepicker-day-selected-track-visible" : ""}`}
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
  if (selectedDate && isValid(parseISO(selectedDate))) {
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
        />
      ) : null}
    </div>
  );
}
