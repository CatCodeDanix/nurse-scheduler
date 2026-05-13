import {
  Schedule,
  Person,
  Rule,
  Violation,
  ObligatedHoursFn,
  ShiftType,
} from "./types";

const SHIFT_HOURS: Record<ShiftType, number> = {
  M: 8,
  E: 8,
  N: 10,
  ME: 16,
  EN: 16,
  MEN: 24,
};

export const defaultObligatedHours: ObligatedHoursFn = (month, year) => {
  // Simple heuristic: 160 hours per month
  return 160;
};

export function validateSchedule(
  schedule: Schedule,
  people: Person[],
  rules: Rule[],
  customObligatedHours?: ObligatedHoursFn,
): Violation[] {
  const violations: Violation[] = [];

  for (const rule of rules) {
    switch (rule.name) {
      case "max-monthly-hours": {
        const fn: ObligatedHoursFn =
          (rule.config?.customFn as ObligatedHoursFn) ||
          customObligatedHours ||
          defaultObligatedHours;
        violations.push(...checkMaxHours(schedule, people, fn));
        break;
      }
      case "no-consecutive-nights":
        violations.push(...checkNoConsecutiveNights(schedule));
        break;
      case "forbidden-shift-type": {
        const forbidden = (rule.config?.forbiddenShiftTypes as string[]) ?? [];
        violations.push(...checkForbiddenShiftTypes(schedule, forbidden));
        break;
      }
      // Future rules can be added here
    }
  }
  return violations;
}

function checkMaxHours(
  schedule: Schedule,
  people: Person[],
  fn: ObligatedHoursFn,
): Violation[] {
  const violations: Violation[] = [];
  const hoursMap = new Map<string, number>();

  for (const entry of schedule.entries) {
    const prev = hoursMap.get(entry.personId) || 0;
    hoursMap.set(entry.personId, prev + (SHIFT_HOURS[entry.shiftType] || 8));
  }

  for (const person of people) {
    const worked = hoursMap.get(person.id) || 0;
    const limit = fn(schedule.month, schedule.year, []); // we'll improve to pass actual holidays
    if (worked > limit) {
      violations.push({
        ruleName: "max-monthly-hours",
        personId: person.id,
        description: `${person.name} worked ${worked}h, exceeding limit of ${limit}h`,
        severity: "error",
      });
    }
  }
  return violations;
}

function checkNoConsecutiveNights(schedule: Schedule): Violation[] {
  const sorted = [...schedule.entries].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const userMap = new Map<string, string[]>();
  for (const e of sorted) {
    const list = userMap.get(e.personId) || [];
    if (e.shiftType === "N") list.push(e.date);
    userMap.set(e.personId, list);
  }

  const violations: Violation[] = [];
  for (const [personId, nightDates] of userMap) {
    // Check if any two consecutive nights appear
    for (let i = 1; i < nightDates.length; i++) {
      // Simple string compare works because ISO dates
      if (nightDates[i] === getNextDay(nightDates[i - 1])) {
        violations.push({
          ruleName: "no-consecutive-nights",
          personId,
          date: nightDates[i],
          description: `Consecutive night shifts on ${nightDates[i - 1]} and ${nightDates[i]}`,
          severity: "error",
        });
      }
    }
  }
  return violations;
}

function checkForbiddenShiftTypes(
  schedule: Schedule,
  forbidden: string[],
): Violation[] {
  const violations: Violation[] = [];
  for (const entry of schedule.entries) {
    if (forbidden.includes(entry.shiftType)) {
      violations.push({
        ruleName: "forbidden-shift-type",
        personId: entry.personId,
        date: entry.date,
        description: `Forbidden shift type '${entry.shiftType}' assigned`,
        severity: "error",
      });
    }
  }
  return violations;
}

// Helper to get the next day in ISO format
function getNextDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
