import GLPK from "glpk.js";
import {
  SchedulingInput,
  Schedule,
  ScheduleEntry,
  ShiftType,
  BaseShiftType,
  SHIFT_COVERAGE,
  SHIFT_HOURS,
  BASE_SHIFT_TYPES,
  STANDARD_SHIFT_TYPES,
} from "./types";
import { getMonthDates, isDateInExpression, isWeekdayMatch } from "./dateUtils";
import { defaultObligatedHours } from "./ruleEngine";

/**
 * Build and solve the MILP for an optimal schedule.
 */
export async function solveSchedule(input: SchedulingInput): Promise<Schedule> {
  const glpk = await GLPK();

  const dates = getMonthDates(input.year, input.month);
  const people = input.people;
  const nPeople = people.length;
  const nDates = dates.length;

  // ---------- Determine possible shift types per person per day ----------
  const allShiftTypesSet = new Set<ShiftType>(STANDARD_SHIFT_TYPES);
  const reliefMap = new Map<
    string,
    {
      date: string;
      baseShiftType: BaseShiftType;
      targetWard: string;
      count: number;
    }[]
  >();
  if (input.reliefRequirements) {
    for (const rr of input.reliefRequirements) {
      const shiftType = `${rr.baseShiftType}_R`;
      allShiftTypesSet.add(shiftType);
      const perDate = reliefMap.get(rr.date) ?? [];
      perDate.push({ ...rr, count: rr.count ?? 1 });
      reliefMap.set(rr.date, perDate);
    }
  }
  const allShiftTypes = Array.from(allShiftTypesSet);

  // Fast lookup: per person, per date, which shift types are allowed
  const allowedShifts: boolean[][][] = Array.from({ length: nPeople }, () =>
    Array.from({ length: nDates }, () =>
      Array(allShiftTypes.length).fill(false),
    ),
  );

  // Person-day request constraints
  for (let p = 0; p < nPeople; p++) {
    const person = people[p];
    for (let d = 0; d < nDates; d++) {
      const date = dates[d];
      if (hasOffDay(input, person.id, date)) continue;
      if (hasLeaveRequest(input, person.id, date)) {
        const idx = allShiftTypes.indexOf("L");
        if (idx >= 0) allowedShifts[p][d][idx] = true;
        continue;
      }

      if (person.assignmentType === "fixed" && person.fixedShiftType) {
        const idx = allShiftTypes.indexOf(person.fixedShiftType);
        if (idx >= 0) allowedShifts[p][d][idx] = true;
      } else {
        for (let s = 0; s < allShiftTypes.length; s++) {
          const shift = allShiftTypes[s];
          if (shift.endsWith("_R")) continue; // relief shifts are only assigned via demand/relief constraints
          if (isForbidden(input, shift)) continue;
          allowedShifts[p][d][s] = true;
        }
      }
    }
  }

  // ---------- Build GLPK model ----------
  const constraints: {
    name: string;
    vars: { name: string; coef: number }[];
    bnds: { type: number; ub: number; lb: number };
  }[] = [];
  const binVars: string[] = [];

  const varName = (p: number, d: number, s: number) => `x_${p}_${d}_${s}`;

  // ---- Constraint 1: At most one shift per person per day ----
  for (let p = 0; p < nPeople; p++) {
    for (let d = 0; d < nDates; d++) {
      const vars: { name: string; coef: number }[] = [];
      for (let s = 0; s < allShiftTypes.length; s++) {
        if (allowedShifts[p][d][s]) {
          vars.push({ name: varName(p, d, s), coef: 1 });
        }
      }
      if (vars.length > 1) {
        constraints.push({
          name: `at_most_one_p${p}_d${d}`,
          vars,
          bnds: { type: glpk.GLP_UP, ub: 1, lb: -Infinity },
        });
      }
    }
  }

  // ---- Constraint 2: Demand coverage (now includes relief shifts) ----
  const demandMap = new Map<string, Record<BaseShiftType, number>>();
  for (const dem of input.demand) demandMap.set(dem.date, dem.required);

  for (let d = 0; d < nDates; d++) {
    const date = dates[d];
    const req = demandMap.get(date);
    if (!req) continue;

    for (const base of BASE_SHIFT_TYPES) {
      const needed = req[base] ?? 0;
      const vars: { name: string; coef: number }[] = [];
      for (let p = 0; p < nPeople; p++) {
        for (let s = 0; s < allShiftTypes.length; s++) {
          if (allowedShifts[p][d][s]) {
            const shift = allShiftTypes[s];
            const coverage = SHIFT_COVERAGE[shift]?.[base] ?? 0;
            if (coverage > 0) {
              vars.push({ name: varName(p, d, s), coef: coverage });
            }
          }
        }
      }
      if (needed > 0) {
        constraints.push({
          name: `demand_d${d}_${base}`,
          vars,
          bnds: { type: glpk.GLP_LO, ub: Infinity, lb: needed },
        });
      }
    }

    // Relief exact constraints
    const reliefs = reliefMap.get(date) ?? [];
    for (const rel of reliefs) {
      const relShift = `${rel.baseShiftType}_R`;
      const sIdx = allShiftTypes.indexOf(relShift);
      if (sIdx === -1) continue;
      const vars: { name: string; coef: number }[] = [];
      for (let p = 0; p < nPeople; p++) {
        if (allowedShifts[p][d][sIdx]) {
          // A relief worker cannot be from the target ward
          if (people[p].homeWard === rel.targetWard) continue;
          vars.push({ name: varName(p, d, sIdx), coef: 1 });
        }
      }
      if (vars.length > 0) {
        constraints.push({
          name: `relief_d${d}_${rel.baseShiftType}`,
          vars,
          bnds: { type: glpk.GLP_FX, ub: rel.count, lb: rel.count },
        });
      }
    }
  }

  // ---- Constraint 3: Maximum monthly hours (only if rule present) ----
  const maxHoursRule = input.rules.find((r) => r.name === "max-monthly-hours");
  if (maxHoursRule) {
    const obligatedFn = maxHoursRule.config?.customFn || defaultObligatedHours;
    const maxHours = obligatedFn(input.month, input.year, input.holidays ?? []);
    for (let p = 0; p < nPeople; p++) {
      const vars: { name: string; coef: number }[] = [];
      for (let d = 0; d < nDates; d++) {
        for (let s = 0; s < allShiftTypes.length; s++) {
          if (allowedShifts[p][d][s]) {
            const hours = SHIFT_HOURS[allShiftTypes[s]] ?? 0;
            if (hours > 0) vars.push({ name: varName(p, d, s), coef: hours });
          }
        }
      }
      if (vars.length > 0) {
        constraints.push({
          name: `max_hours_p${p}`,
          vars,
          bnds: { type: glpk.GLP_UP, ub: maxHours, lb: -Infinity },
        });
      }
    }
  }

  // ---- Constraint 4: No consecutive night shifts (only if rule present) ----
  const noConsecRule = input.rules.find(
    (r) => r.name === "no-consecutive-nights",
  );
  if (noConsecRule) {
    for (let p = 0; p < nPeople; p++) {
      for (let d = 0; d < nDates - 1; d++) {
        const nightShiftsToday: string[] = [];
        const nightShiftsNext: string[] = [];
        for (let s = 0; s < allShiftTypes.length; s++) {
          const shift = allShiftTypes[s];
          if (shift === "N" || shift === "N_R") {
            if (allowedShifts[p][d][s]) nightShiftsToday.push(varName(p, d, s));
            if (allowedShifts[p][d + 1][s])
              nightShiftsNext.push(varName(p, d + 1, s));
          }
        }
        if (nightShiftsToday.length > 0 && nightShiftsNext.length > 0) {
          constraints.push({
            name: `no_consec_night_p${p}_d${d}`,
            vars: [
              ...nightShiftsToday.map((v) => ({ name: v, coef: 1 })),
              ...nightShiftsNext.map((v) => ({ name: v, coef: 1 })),
            ],
            bnds: { type: glpk.GLP_UP, ub: 1, lb: -Infinity },
          });
        }
      }
    }
  }

  // ---- Objective: minimize weighted preference violations ----
  const objVars: { name: string; coef: number }[] = [];
  const PENALTY = 1000;

  for (const pref of input.preferences) {
    if (pref.type === "shift-pattern") {
      const { personId, weight, details } = pref;
      const p = people.findIndex((p) => p.id === personId);
      if (p === -1) continue;

      if (details.avoidConsecutive) {
        const avoidType = details.avoidConsecutive;
        for (let d = 0; d < nDates - 1; d++) {
          const s1 = allShiftTypes.indexOf(avoidType);
          const s2 = s1;
          if (
            s1 >= 0 &&
            allowedShifts[p][d][s1] &&
            allowedShifts[p][d + 1][s2]
          ) {
            const auxName = `viol_consec_${p}_${d}_${avoidType}`;
            binVars.push(auxName);
            objVars.push({ name: auxName, coef: weight * PENALTY });

            constraints.push({
              name: `aux_consec_${p}_${d}_${avoidType}`,
              vars: [
                { name: varName(p, d, s1), coef: 1 },
                { name: varName(p, d + 1, s2), coef: 1 },
                { name: auxName, coef: -1 },
              ],
              bnds: { type: glpk.GLP_UP, ub: 1, lb: -Infinity },
            });
          }
        }
      }

      if (details.maxConsecutiveNights) {
        const maxN = details.maxConsecutiveNights;
        for (let d = 0; d < nDates - maxN; d++) {
          const windowSize = maxN + 1;
          const vars: { name: string; coef: number }[] = [];
          for (let w = 0; w < windowSize; w++) {
            const idx = d + w;
            for (let s = 0; s < allShiftTypes.length; s++) {
              const shift = allShiftTypes[s];
              if (
                (shift === "N" || shift === "N_R") &&
                allowedShifts[p][idx][s]
              ) {
                vars.push({ name: varName(p, idx, s), coef: 1 });
              }
            }
          }
          if (vars.length > 0) {
            const auxName = `viol_max_night_${p}_${d}`;
            binVars.push(auxName);
            objVars.push({ name: auxName, coef: weight * PENALTY });
            vars.push({ name: auxName, coef: -windowSize });
            constraints.push({
              name: `aux_max_night_${p}_${d}`,
              vars,
              bnds: { type: glpk.GLP_UP, ub: maxN, lb: -Infinity },
            });
          }
        }
      }

      if (details.preferredShifts) {
        const preferredSet = new Set(details.preferredShifts);
        for (let d = 0; d < nDates; d++) {
          for (let s = 0; s < allShiftTypes.length; s++) {
            const shift = allShiftTypes[s];
            if (!preferredSet.has(shift) && allowedShifts[p][d][s]) {
              // Penalize non‑preferred shifts (soft)
              objVars.push({ name: varName(p, d, s), coef: weight * PENALTY });
            }
          }
        }
      }
    } else if (pref.type === "co-worker") {
      const { personId, weight, details } = pref;
      const p = people.findIndex((p) => p.id === personId);
      if (p === -1) continue;

      if (details.avoidWith) {
        for (const avoidId of details.avoidWith) {
          const q = people.findIndex((p) => p.id === avoidId);
          if (q === -1) continue;
          for (let d = 0; d < nDates; d++) {
            const auxName = `viol_avoid_${p}_${q}_${d}`;
            binVars.push(auxName);
            objVars.push({ name: auxName, coef: weight * PENALTY });

            const varsP: string[] = [];
            const varsQ: string[] = [];
            for (let s = 0; s < allShiftTypes.length; s++) {
              if (allowedShifts[p][d][s]) varsP.push(varName(p, d, s));
              if (allowedShifts[q][d][s]) varsQ.push(varName(q, d, s));
            }
            if (varsP.length > 0 && varsQ.length > 0) {
              constraints.push({
                name: `aux_avoid_${p}_${q}_${d}`,
                vars: [
                  ...varsP.map((v) => ({ name: v, coef: 1 })),
                  ...varsQ.map((v) => ({ name: v, coef: 1 })),
                  { name: auxName, coef: -1 },
                ],
                bnds: { type: glpk.GLP_UP, ub: 1, lb: -Infinity },
              });
            }
          }
        }
      }

      if (details.preferWith) {
        for (const preferId of details.preferWith) {
          const q = people.findIndex((p) => p.id === preferId);
          if (q === -1) continue;
          for (let d = 0; d < nDates; d++) {
            const auxName = `viol_prefer_${p}_${q}_${d}`;
            binVars.push(auxName);
            objVars.push({ name: auxName, coef: weight * PENALTY });

            const varsP: string[] = [];
            const varsQ: string[] = [];
            for (let s = 0; s < allShiftTypes.length; s++) {
              if (allowedShifts[p][d][s]) varsP.push(varName(p, d, s));
              if (allowedShifts[q][d][s]) varsQ.push(varName(q, d, s));
            }
            if (varsP.length > 0 && varsQ.length > 0) {
              constraints.push({
                name: `aux_prefer_${p}_${q}_${d}`,
                vars: [
                  ...varsP.map((v) => ({ name: v, coef: 1 })),
                  ...varsQ.map((v) => ({ name: v, coef: -1 })),
                  { name: auxName, coef: -1 },
                ],
                bnds: { type: glpk.GLP_UP, ub: 0, lb: -Infinity },
              });
            }
          }
        }
      }
    }
  }

  // Build LP model
  const model = {
    name: "nurse_schedule",
    objective: {
      direction: glpk.GLP_MIN, // 1 = minimize
      name: "obj",
      vars: objVars,
    },
    subjectTo: constraints,
    binaries: binVars,
  };

  const result = await glpk.solve(model, {
    msglev: glpk.GLP_MSG_OFF,
    presol: true,
  });

  if (result.result.status !== glpk.GLP_OPT) {
    throw new Error(
      `GLPK failed to find optimal solution: status ${result.result.status}`,
    );
  }

  // Extract solution
  const solution = result.result.vars;
  const entries: ScheduleEntry[] = [];
  for (let p = 0; p < nPeople; p++) {
    for (let d = 0; d < nDates; d++) {
      for (let s = 0; s < allShiftTypes.length; s++) {
        if (allowedShifts[p][d][s]) {
          const val = solution[varName(p, d, s)];
          if (val > 0.9) {
            const shiftType = allShiftTypes[s];
            const isRelief = shiftType.endsWith("_R");
            let targetWard: string | undefined;
            if (isRelief) {
              const base = shiftType.replace("_R", "") as BaseShiftType;
              const rels = reliefMap.get(dates[d]) ?? [];
              const match = rels.find((r) => r.baseShiftType === base);
              targetWard = match?.targetWard;
            }
            entries.push({
              personId: people[p].id,
              date: dates[d],
              shiftType,
              isRelief,
              targetWard,
            });
          }
        }
      }
    }
  }

  return {
    month: input.month,
    year: input.year,
    entries,
  };
}

// ---------- Helpers ----------
function hasOffDay(
  input: SchedulingInput,
  personId: string,
  date: string,
): boolean {
  return input.requests.some((r) => {
    if (r.personId !== personId) return false;
    if (r.type === "off-day") return isDateInExpression(date, r.dates);
    if (r.type === "recurring-off")
      return isWeekdayMatch(date, r.recurringWeekday);
    return false;
  });
}

function hasLeaveRequest(
  input: SchedulingInput,
  personId: string,
  date: string,
): boolean {
  return input.requests.some(
    (r) =>
      r.personId === personId &&
      r.type === "leave" &&
      isDateInExpression(date, r.dates),
  );
}

function isForbidden(input: SchedulingInput, shiftType: ShiftType): boolean {
  const rule = input.rules.find((r) => r.name === "forbidden-shift-type");
  if (!rule) return false;
  const forbidden: string[] = rule.config?.forbiddenShiftTypes ?? [];
  return forbidden.includes(shiftType);
}
