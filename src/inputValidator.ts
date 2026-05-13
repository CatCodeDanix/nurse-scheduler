import { SchedulingInput, Violation, BASE_SHIFT_TYPES } from "./types";
import { isDateInExpression, isWeekdayMatch, getMonthDates } from "./dateUtils";

/**
 * Validate the scheduling input for consistency before solving.
 * Returns a list of violations (warnings/errors).
 */
export function validateInput(input: SchedulingInput): Violation[] {
  const violations: Violation[] = [];
  const dates = getMonthDates(input.year, input.month);
  const dateSet = new Set(dates);

  // ---- Demand coverage ----
  const demandDates = new Set(input.demand.map((d) => d.date));
  for (const date of dates) {
    if (!demandDates.has(date)) {
      violations.push({
        ruleName: "missing-demand",
        date,
        description: `No demand defined for ${date}`,
        severity: "error",
      });
    }
  }

  // Demand completeness
  for (const dem of input.demand) {
    if (!dateSet.has(dem.date)) continue;
    for (const base of BASE_SHIFT_TYPES) {
      if (dem.required[base] === undefined) {
        violations.push({
          ruleName: "incomplete-demand",
          date: dem.date,
          description: `Missing required count for base shift type '${base}'`,
          severity: "warning",
        });
      }
    }
  }

  // ---- Unique person IDs ----
  const ids = input.people.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    violations.push({
      ruleName: "duplicate-person-id",
      description: "Duplicate person IDs found",
      severity: "error",
    });
  }

  // ---- Request references ----
  for (const req of input.requests) {
    if (!ids.includes(req.personId)) {
      violations.push({
        ruleName: "unknown-person-in-request",
        personId: req.personId,
        description: "Request references unknown person",
        severity: "error",
      });
    }
    // Date range validity
    if ("dates" in req) {
      for (const d of req.dates.singleDates ?? []) {
        if (!dateSet.has(d)) {
          violations.push({
            ruleName: "date-out-of-range",
            date: d,
            description: "Request date is outside the scheduling month",
            severity: "warning",
          });
        }
      }
      for (const range of req.dates.dateRanges ?? []) {
        if (!dateSet.has(range.start) || !dateSet.has(range.end)) {
          violations.push({
            ruleName: "date-out-of-range",
            description: `Range ${range.start}–${range.end} partially outside month`,
            severity: "warning",
          });
        }
      }
    }
  }

  // ---- Preference references ----
  for (const pref of input.preferences) {
    if (!ids.includes(pref.personId)) {
      violations.push({
        ruleName: "unknown-person-in-preference",
        personId: pref.personId,
        description: "Preference references unknown person",
        severity: "error",
      });
    }
    if (pref.type === "co-worker") {
      for (const other of [
        ...(pref.details.preferWith ?? []),
        ...(pref.details.avoidWith ?? []),
      ]) {
        if (!ids.includes(other)) {
          violations.push({
            ruleName: "unknown-co-worker",
            personId: pref.personId,
            description: `Co-worker preference references unknown person ${other}`,
            severity: "error",
          });
        }
      }
    }
  }

  // ---- Holiday dates ----
  if (input.holidays) {
    for (const h of input.holidays) {
      if (!dateSet.has(h)) {
        violations.push({
          ruleName: "holiday-outside-month",
          date: h,
          description: "Holiday date is outside scheduling month",
          severity: "warning",
        });
      }
    }
  }

  // ---- Fixed shift vs forbidden shift type ----
  const forbiddenRule = input.rules.find(
    (r) => r.name === "forbidden-shift-type",
  );
  const forbiddenShiftTypes: string[] =
    (forbiddenRule?.config?.forbiddenShiftTypes as string[]) ?? [];
  for (const person of input.people) {
    if (
      person.assignmentType === "fixed" &&
      person.fixedShiftType &&
      forbiddenShiftTypes.includes(person.fixedShiftType)
    ) {
      violations.push({
        ruleName: "fixed-shift-conflict",
        personId: person.id,
        description: `Fixed shift type '${person.fixedShiftType}' is forbidden by hospital rules`,
        severity: "error",
      });
    }
  }

  return violations;
}
