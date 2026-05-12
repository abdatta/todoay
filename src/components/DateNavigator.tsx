"use client";

import { format, addDays, isValid, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CustomDatePicker from "@/components/CustomDatePicker";

export default function DateNavigator({
  date,
  onChange,
  dateProgress,
}: {
  date: string;
  onChange: (value: string) => void;
  dateProgress?: Record<string, { completed: number; total: number; showTrackWhenSelected?: boolean; useTrackColorValue?: boolean }>;
}) {
  const parsed = parseISO(date);
  const isConcreteDate = isValid(parsed);

  return (
    <div className="date-selector-container">
      <button
        className="btn-icon-clear"
        onClick={() => {
          if (isConcreteDate) {
            onChange(format(addDays(parsed, -1), "yyyy-MM-dd"));
          }
        }}
        aria-label="Previous day"
        disabled={!isConcreteDate}
      >
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>

      <div className="select-wrapper">
        <CustomDatePicker selectedDate={date} onChange={onChange} dateProgress={dateProgress} />
      </div>

      <button
        className="btn-icon-clear"
        onClick={() => {
          if (isConcreteDate) {
            onChange(format(addDays(parsed, 1), "yyyy-MM-dd"));
          }
        }}
        aria-label="Next day"
        disabled={!isConcreteDate}
      >
        <ChevronRight size={20} strokeWidth={2.5} />
      </button>
    </div>
  );
}
