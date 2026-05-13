import {
  Schedule,
  Person,
  Violation,
  ObligatedHoursFn,
  SHIFT_HOURS,
} from "./types";
import { getNextDay } from "./dateUtils";

// ---------- Rule checker type ----------
export type RuleChecker = (
  schedule: Schedule,
  people: Person[],
  config?: Record<string, any>,
  holidays?: string[],
) => Violation[];

const ruleRegistry = new Map<string, RuleChecker>();

// Register a built‑in rule
export function registerRule(name: string, checker: RuleChecker) {
  ruleRegistry.set(name, checker);
}

// ---------- Default Obligated Hours (Iran: 176 h/month) ----------
export const defaultObligatedHours: ObligatedHoursFn = () => 176;

// ---------- Built‑in rules ----------

// 1. Max monthly hours
registerRule("max-monthly-hours", (schedule, people, config, holidays) => {
  const obligatedFn: ObligatedHoursFn =
    config?.customFn || defaultObligatedHours;
  const limit = obligatedFn(schedule.month, schedule.year, holidays ?? []);
  const violations: Violation[] = [];

  const personHours = new Map<string, number>();
  for (const entry of schedule.entries) {
    const h = SHIFT_HOURS[entry.shiftType] ?? 0;
    personHours.set(entry.personId, (personHours.get(entry.personId) ?? 0) + h);
  }

  for (const p of people) {
    const worked = personHours.get(p.id) ?? 0;
    if (worked > limit) {
      violations.push({
        ruleName: "max-monthly-hours",
        personId: p.id,
        description: `${p.name} worked ${worked}h, exceeding limit of ${limit}h`,
        severity: "error",
      });
    }
  }
  return violations;
});

// 2. No consecutive night shifts
registerRule("no-consecutive-nights", (schedule) => {
  const violations: Violation[] = [];
  const nightEntries = schedule.entries
    .filter((e) => e.shiftType === "N" || e.shiftType.startsWith("N_"))
    .sort((a, b) => a.date.localeCompare(b.date));

  const personNights = new Map<string, string[]>();
  for (const e of nightEntries) {
    const list = personNights.get(e.personId) ?? [];
    list.push(e.date);
    personNights.set(e.personId, list);
  }

  for (const [personId, nights] of personNights) {
    for (let i = 1; i < nights.length; i++) {
      if (nights[i] === getNextDay(nights[i - 1])) {
        violations.push({
          ruleName: "no-consecutive-nights",
          personId,
          date: nights[i],
          description: `Consecutive night shifts on ${nights[i - 1]} and ${nights[i]}`,
          severity: "error",
        });
      }
    }
  }
  return violations;
});

// 3. Forbidden shift types
registerRule("forbidden-shift-type", (schedule, _people, config) => {
  const forbidden: string[] = config?.forbiddenShiftTypes ?? [];
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
});

// 4. Minimum rest after night shift
registerRule("min-rest-after-night", (schedule) => {
  const violations: Violation[] = [];
  // Group entries by person
  const byPerson = new Map<string, Map<string, string>>();
  for (const e of schedule.entries) {
    const map = byPerson.get(e.personId) ?? new Map();
    map.set(e.date, e.shiftType);
    byPerson.set(e.personId, map);
  }

  for (const [personId, dateShiftMap] of byPerson) {
    const dates = [...dateShiftMap.keys()].sort();
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const shift = dateShiftMap.get(date);
      if (shift === "N" || shift === "N_R") {
        const nextDay = getNextDay(date);
        // If the person works any shift on the next day (excluding leave), it's a violation.
        // Leave shift 'L' doesn't count as a real shift – it's a paid leave, but physically they are off.
        const nextShift = dateShiftMap.get(nextDay);
        if (nextShift && nextShift !== "L") {
          violations.push({
            ruleName: "min-rest-after-night",
            personId,
            date: nextDay,
            description: `Night shift on ${date} must be followed by a full day off (no shift on ${nextDay})`,
            severity: "error",
          });
        }
      }
    }
  }
  return violations;
});

// ---------- Default government rule set ----------
export const DEFAULT_GOVERNMENT_RULES: {
  name: string;
  source: "government" | "hospital";
  config?: any;
}[] = [
  { name: "no-consecutive-nights", source: "government" },
  { name: "min-rest-after-night", source: "government" },
];

// Evaluate all rules on a schedule
export function evaluateRules(
  schedule: Schedule,
  people: Person[],
  rules: { name: string; config?: any; source?: string }[],
  holidays?: string[],
): Violation[] {
  const violations: Violation[] = [];
  for (const rule of rules) {
    const checker = ruleRegistry.get(rule.name);
    if (checker) {
      violations.push(...checker(schedule, people, rule.config, holidays));
    } else {
      violations.push({
        ruleName: rule.name,
        description: `Unknown rule "${rule.name}"`,
        severity: "error",
      });
    }
  }
  return violations;
}
