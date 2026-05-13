export type ShiftType = "M" | "E" | "N" | "ME" | "EN" | "MEN";
export type Role = "HeadNurse" | "Nurse" | "AsstNurse" | "Secretary";
export type AssignmentType = "fixed" | "variable";

export interface Person {
  id: string;
  name: string;
  role: Role;
  assignmentType: AssignmentType;
  fixedShiftType?: ShiftType;
  homeWard?: string;
}

// ---------- Date expressions ----------
export interface DateExpression {
  singleDates?: string[]; // 'YYYY-MM-DD'
  dateRanges?: { start: string; end: string }[];
}

// ---------- Requests (discriminated union) ----------
export interface BaseRequest {
  personId: string;
  priority: number; // 1 (low) – 10 (high)
}

export interface LeaveRequest extends BaseRequest {
  type: "leave";
  dates: DateExpression;
}

export interface OffDayRequest extends BaseRequest {
  type: "off-day";
  dates: DateExpression;
}

export interface RecurringOffRequest extends BaseRequest {
  type: "recurring-off";
  recurringWeekday: number; // 0=Sun … 6=Sat
}

export type Request = LeaveRequest | OffDayRequest | RecurringOffRequest;

// ---------- Preferences (discriminated union) ----------
export interface ShiftPatternPreference {
  type: "shift-pattern";
  personId: string;
  weight: number;
  details: {
    avoidConsecutive?: ShiftType;
    maxConsecutiveNights?: number;
    preferredShifts?: ShiftType[];
  };
}

export interface CoWorkerPreference {
  type: "co-worker";
  personId: string;
  weight: number;
  details: {
    preferWith?: string[];
    avoidWith?: string[];
  };
}

export type Preference = ShiftPatternPreference | CoWorkerPreference;

// ---------- Rules ----------
export interface Rule {
  source: "government" | "hospital";
  name: string;
  config?: Record<string, any>;
}

// Optional hook for custom obligated hours formula
export type ObligatedHoursFn = (
  month: number,
  year: number,
  holidays: string[],
) => number;

// ---------- Schedule output ----------
export interface ScheduleEntry {
  personId: string;
  date: string; // 'YYYY-MM-DD'
  shiftType: ShiftType;
  isRelief: boolean;
  targetWard?: string; // if set, it's a relief shift (different from person.homeWard)
}

export interface Schedule {
  month: number; // 1-12
  year: number;
  entries: ScheduleEntry[];
}

export interface Violation {
  ruleName: string;
  personId?: string;
  date?: string;
  description: string;
  severity: "error" | "warning";
}

// ---------- Library input ----------
export interface SchedulingInput {
  people: Person[];
  requests: Request[];
  preferences: Preference[];
  rules: Rule[];
  month: number;
  year: number;
  holidays?: string[]; // ISO dates
}
