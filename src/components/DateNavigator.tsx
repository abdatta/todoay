"use client";

import { format, addDays, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CustomDatePicker from "@/components/CustomDatePicker";

export default function DateNavigator({
  date,
  onChange,
}: {
  date: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseISO(date);

  return (
    <div className="date-selector-container">
      <button
        className="btn-icon-clear"
        onClick={() => onChange(format(addDays(parsed, -1), "yyyy-MM-dd"))}
        aria-label="Previous day"
      >
        <ChevronLeft size={20} strokeWidth={2.5} />
      </button>

      <div className="select-wrapper">
        <CustomDatePicker selectedDate={date} onChange={onChange} />
      </div>

      <button
        className="btn-icon-clear"
        onClick={() => onChange(format(addDays(parsed, 1), "yyyy-MM-dd"))}
        aria-label="Next day"
      >
        <ChevronRight size={20} strokeWidth={2.5} />
      </button>
    </div>
  );
}
