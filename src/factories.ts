import {
  Person,
  Role,
  ShiftType,
  LeaveRequest,
  OffDayRequest,
  RecurringOffRequest,
  DateExpression,
  ShiftPatternPreference,
  CoWorkerPreference,
  Rule,
} from "./types";

export function createPerson(
  id: string,
  name: string,
  role: Role,
  assignmentType: "fixed" | "variable" = "variable",
  fixedShiftType?: ShiftType,
  homeWard?: string,
): Person {
  return { id, name, role, assignmentType, fixedShiftType, homeWard };
}

export function createLeaveRequest(
  personId: string,
  dates: DateExpression,
  priority = 5,
): LeaveRequest {
  return { type: "leave", personId, dates, priority };
}

export function createOffDayRequest(
  personId: string,
  dates: DateExpression,
  priority = 5,
): OffDayRequest {
  return { type: "off-day", personId, dates, priority };
}

export function createRecurringOffRequest(
  personId: string,
  weekday: number,
  priority = 5,
): RecurringOffRequest {
  return {
    type: "recurring-off",
    personId,
    recurringWeekday: weekday,
    priority,
  };
}

export function createShiftPreference(
  personId: string,
  details: ShiftPatternPreference["details"],
  weight = 5,
): ShiftPatternPreference {
  return { type: "shift-pattern", personId, weight, details };
}

export function createCoWorkerPreference(
  personId: string,
  details: CoWorkerPreference["details"],
  weight = 5,
): CoWorkerPreference {
  return { type: "co-worker", personId, weight, details };
}

export function createRule(
  source: "government" | "hospital",
  name: string,
  config?: any,
): Rule {
  return { source, name, config };
}
