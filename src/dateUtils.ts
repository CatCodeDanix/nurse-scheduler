import {
  parseISO,
  isWithinInterval,
  getDay,
  eachDayOfInterval,
  format,
  lastDayOfMonth,
  startOfMonth,
} from "date-fns";
import { DateExpression } from "./types";

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

export function getMonthDates(year: number, month: number): string[] {
  const start = startOfMonth(new Date(year, month - 1));
  const end = lastDayOfMonth(start);
  return eachDayOfInterval({ start, end }).map((d) => format(d, "yyyy-MM-dd"));
}

export function isWeekdayMatch(dateStr: string, weekday: number): boolean {
  return getDay(parseISO(dateStr)) === weekday;
}
