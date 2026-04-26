import { format, isToday, isYesterday } from "date-fns";

export const formatSyncedMoment = (timestamp: string | null, now = new Date()) => {
  if (!timestamp) {
    return "-";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  if (isToday(date)) {
    return format(date, "h:mm a").toLowerCase();
  }

  if (isYesterday(date)) {
    return `yesterday, ${format(date, "h:mm a").toLowerCase()}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return format(date, "MMM d, h:mm a").toLowerCase();
  }

  return format(date, "MMM d, yyyy, h:mm a").toLowerCase();
};

export const formatSyncedText = (timestamp: string | null, now = new Date()) =>
  `Synced at ${formatSyncedMoment(timestamp, now)}`;
