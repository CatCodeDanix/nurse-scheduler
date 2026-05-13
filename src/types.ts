// ---------- Roles (extensible) ----------
export const NURSING_ROLES = [
  "HeadNurse",
  "Nurse",
  "AsstNurse",
  "Secretary",
] as const;
export type NursingRole = (typeof NURSING_ROLES)[number];
export type Role = string; // open for other professions

// ---------- Shift types ----------
export const BASE_SHIFT_TYPES = ["M", "E", "N"] as const;
export type BaseShiftType = (typeof BASE_SHIFT_TYPES)[number];

export const STANDARD_SHIFT_TYPES = [
  "M",
  "E",
  "N",
  "ME",
  "EN",
  "MEN",
  "L",
] as const;
export type StandardShiftType = (typeof STANDARD_SHIFT_TYPES)[number];

export type ShiftType = string; // e.g., 'M', 'N_R', 'L', etc.

// ---------- Coverage mapping (how many base slots a shift fills) ----------
export const SHIFT_COVERAGE: Record<
  string,
  Partial<Record<BaseShiftType, number>>
> = {
  M: { M: 1 },
  E: { E: 1 },
  N: { N: 1 },
  ME: { M: 1, E: 1 },
  EN: { E: 1, N: 1 },
  MEN: { M: 1, E: 1, N: 1 },
  L: {}, // leave shift – does not cover any base shift
  // Relief shift variants (cover same base shift slots)
  M_R: { M: 1 },
  E_R: { E: 1 },
  N_R: { N: 1 },
  ME_R: { M: 1, E: 1 },
  EN_R: { E: 1, N: 1 },
  MEN_R: { M: 1, E: 1, N: 1 },
};

// ---------- Worked hours per shift (Iran typical) ----------
export const SHIFT_HOURS: Record<string, number> = {
  M: 8,
  E: 8,
  N: 12, // Iran typical night shift length
  ME: 16,
  EN: 20,
  MEN: 28,
  L: 8, // leave counts as 8 hours
  // Relief shifts
  M_R: 8,
  E_R: 8,
  N_R: 12,
  ME_R: 16,
  EN_R: 20,
  MEN_R: 28,
};

// ---------- Person ----------
export interface Person {
  id: string;
  name: string;
  role: Role;
  assignmentType: "fixed" | "variable";
  fixedShiftType?: ShiftType; // only for fixed assignment
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

// ---------- Demand & relief ----------
export interface ShiftDemand {
  date: string; // 'YYYY-MM-DD'
  required: Record<BaseShiftType, number>; // e.g., { M: 2, E: 2, N: 1 }
}

export interface ReliefRequirement {
  date: string;
  baseShiftType: BaseShiftType;
  targetWard: string;
  count?: number; // default 1
}

// ---------- Schedule output ----------
export interface ScheduleEntry {
  personId: string;
  date: string; // 'YYYY-MM-DD'
  shiftType: ShiftType; // can be 'M', 'N_R', 'L', etc.
  isRelief: boolean;
  targetWard?: string; // set when isRelief = true
}

export interface Schedule {
  month: number; // 1-12
  year: number;
  entries: ScheduleEntry[];
}

// ---------- Violation ----------
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
  demand: ShiftDemand[];
  reliefRequirements?: ReliefRequirement[];
}
