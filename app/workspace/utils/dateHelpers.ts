import { format, parse } from 'date-fns';

// TODO: Migrate all date functions to use date-fns consistently
// Some legacy functions still use manual string manipulation for backwards compatibility

export const toDateInputValue = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;  // YYYY-MM-DD format
};

export const toTimeInputValue = (date: Date) => {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

// Display format: DD-MM-YYYY (more human-readable than ISO)
export function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}-${month}-${year}`;
}

// Parse DD-MM-YYYY back to ISO format
export const parseDisplayDate = (value: string) => {
  const match = value.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  // Validate the date is actually valid (catches things like Feb 30)
  if (toDateInputValue(parsed) !== iso) {
    return null;
  }

  return iso;
};

export const isValidTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

// Quick date checks
export const isToday = (dateStr: string): boolean => {
  return dateStr === toDateInputValue(new Date());
};

export const isOverdue = (dateStr: string): boolean => {
  return dateStr < toDateInputValue(new Date());
};
