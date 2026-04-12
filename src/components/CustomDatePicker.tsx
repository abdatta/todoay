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
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CustomDatePickerProps {
  selectedDate: string;
  onChange: (date: string) => void;
  displayDates?: string[];
  disabled?: boolean;
}

export default function CustomDatePicker({
  selectedDate,
  onChange,
  displayDates = [],
  disabled,
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const initialViewDate =
    selectedDate && isValid(parseISO(selectedDate))
      ? parseISO(selectedDate)
      : new Date();
  const [viewDate, setViewDate] = useState<Date>(initialViewDate);
  const popupRef = useRef<HTMLDivElement>(null);
  const hasRestrictedDates = displayDates.length > 0;

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

  const handlePrevMonth = (event: React.MouseEvent) => {
    event.stopPropagation();
    setViewDate(subMonths(viewDate, 1));
  };

  const handleNextMonth = (event: React.MouseEvent) => {
    event.stopPropagation();
    setViewDate(addMonths(viewDate, 1));
  };

  const handleSelectDay = (date: Date) => {
    onChange(format(date, "yyyy-MM-dd"));
    setIsOpen(false);
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
    setIsOpen(false);
  };

  const handleToday = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(format(new Date(), "yyyy-MM-dd"));
    setIsOpen(false);
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
        <div className="datepicker-popup">
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

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`datepicker-day ${!isCurrentMonth ? "datepicker-day-outside" : ""} ${isSelected ? "datepicker-day-selected" : ""} ${isTodayDate && !isSelected ? "datepicker-day-today" : ""} ${!isAvailable ? "datepicker-day-unavailable" : ""}`}
                >
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
      ) : null}
    </div>
  );
}
