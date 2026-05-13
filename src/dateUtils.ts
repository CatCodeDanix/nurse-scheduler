import {
  parseISO,
  isWithinInterval,
  getDay,
  eachDayOfInterval,
  format,
  startOfMonth,
  lastDayOfMonth,
  addDays,
} from "date-fns";
import { DateExpression } from "./types";

/**
 * Check if a date string is included in the given expression.
 */
export function isDateInExpression(
  dateStr: string,
  expr: DateExpression,
): boolean {
  if (expr.singleDates?.includes(dateStr)) return true;
  if (expr.dateRanges) {
    const target = parseISO(dateStr);
    for (const range of expr.dateRanges) {
      if (
        isWithinInterval(target, {
          start: parseISO(range.start),
          end: parseISO(range.end),
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Return all dates of a given month as 'YYYY-MM-DD'.
 */
export function getMonthDates(year: number, month: number): string[] {
  const start = startOfMonth(new Date(year, month - 1));
  const end = lastDayOfMonth(start);
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

/**
 * Does the date fall on a given weekday? (0=Sun)
 */
export function isWeekdayMatch(dateStr: string, weekday: number): boolean {
  return getDay(parseISO(dateStr)) === weekday;
}

/**
 * Get the next day in 'YYYY-MM-DD' format.
 */
export function getNextDay(dateStr: string): string {
  const d = new Date(dateStr);
  return format(addDays(d, 1), "yyyy-MM-dd");
}
