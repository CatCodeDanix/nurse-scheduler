import { describe, it, expect } from "vitest";
import { LocalScheduler, AIExporter } from "../src/scheduler";
import {
  createPerson,
  createLeaveRequest,
  createOffDayRequest,
  createRecurringOffRequest,
  createShiftPreference,
  createCoWorkerPreference,
  createRule,
  createShiftDemand,
  createReliefRequirement,
} from "../src/factories";
import { SchedulingInput } from "../src/types";
import { getMonthDates } from "../src/dateUtils";
import { DEFAULT_GOVERNMENT_RULES } from "../src/ruleEngine";

describe("LocalScheduler (MILP)", () => {
  const year = 2026;
  const month = 6;
  const dates = getMonthDates(year, month);

  const basePeople = [
    createPerson("n1", "Alice", "Nurse", "variable"),
    createPerson("n2", "Bob", "Nurse", "variable"),
    createPerson("n3", "Carol", "Nurse", "fixed", "N"),
  ];

  const demand = dates.map((d) => createShiftDemand(d, { M: 1, E: 1, N: 1 }));

  it("generates a valid schedule with all rules active", async () => {
    const input: SchedulingInput = {
      people: basePeople,
      requests: [],
      preferences: [],
      rules: [...DEFAULT_GOVERNMENT_RULES],
      month,
      year,
      demand,
    };
    const result = await new LocalScheduler().generate(input);
    expect(result.schedule).toBeDefined();
    expect(
      result.violations.filter((v) => v.severity === "error"),
    ).toHaveLength(0);
  });

  it("respects off‑day request", async () => {
    const input: SchedulingInput = {
      people: basePeople,
      requests: [createOffDayRequest("n1", { singleDates: [dates[0]] })],
      preferences: [],
      rules: [],
      month,
      year,
      demand,
    };
    const result = await new LocalScheduler().generate(input);
    expect(
      result.schedule!.entries.find(
        (e) => e.personId === "n1" && e.date === dates[0],
      ),
    ).toBeUndefined();
  });

  it("forces leave shift on leave request", async () => {
    const input: SchedulingInput = {
      people: basePeople,
      requests: [createLeaveRequest("n1", { singleDates: [dates[0]] })],
      preferences: [],
      rules: [],
      month,
      year,
      demand,
    };
    const result = await new LocalScheduler().generate(input);
    const leaveEntry = result.schedule!.entries.find(
      (e) => e.personId === "n1" && e.date === dates[0],
    );
    expect(leaveEntry).toBeDefined();
    expect(leaveEntry!.shiftType).toBe("L");
  });

  it("respects fixed shift assignment", async () => {
    const input: SchedulingInput = {
      people: [
        createPerson("fx", "FixedM", "Nurse", "fixed", "M"),
        createPerson("v1", "Var", "Nurse", "variable"),
      ],
      requests: [],
      preferences: [],
      rules: [],
      month,
      year,
      demand: dates.map((d) => createShiftDemand(d, { M: 1, E: 0, N: 0 })),
    };
    const result = await new LocalScheduler().generate(input);
    for (const e of result.schedule!.entries) {
      if (e.personId === "fx") expect(e.shiftType).toBe("M");
    }
  });

  it("avoids consecutive nights when preference is strong", async () => {
    const input: SchedulingInput = {
      people: [
        createPerson("n1", "Nurse1", "Nurse", "variable"),
        createPerson("n2", "Nurse2", "Nurse", "variable"),
      ],
      requests: [],
      preferences: [createShiftPreference("n1", { avoidConsecutive: "N" }, 10)],
      rules: [],
      month,
      year,
      demand: dates.map((d) => createShiftDemand(d, { M: 0, E: 0, N: 2 })),
    };
    const result = await new LocalScheduler().generate(input);
    const n1Nights = result
      .schedule!.entries.filter(
        (e) => e.personId === "n1" && e.shiftType === "N",
      )
      .map((e) => e.date)
      .sort();
    for (let i = 1; i < n1Nights.length; i++) {
      const prev = new Date(n1Nights[i - 1]);
      const curr = new Date(n1Nights[i]);
      const diffDays =
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(1);
    }
  });

  it("enforces min-rest-after-night hard rule", async () => {
    const input: SchedulingInput = {
      people: [
        createPerson("n1", "Nurse1", "Nurse", "variable"),
        createPerson("n2", "Nurse2", "Nurse", "variable"),
      ],
      requests: [],
      preferences: [],
      rules: [createRule("government", "min-rest-after-night")],
      month,
      year,
      demand: dates.map((d) => createShiftDemand(d, { M: 0, E: 0, N: 2 })),
    };
    const result = await new LocalScheduler().generate(input);
    expect(result.schedule).toBeDefined();
    // Check that no nurse has a shift on the day after a night shift
    const byPerson = new Map<string, Map<string, string>>();
    for (const e of result.schedule!.entries) {
      const map = byPerson.get(e.personId) ?? new Map();
      map.set(e.date, e.shiftType);
      byPerson.set(e.personId, map);
    }
    for (const [, dateMap] of byPerson) {
      const sorted = [...dateMap.keys()].sort();
      for (let i = 0; i < sorted.length - 1; i++) {
        const today = dateMap.get(sorted[i]);
        const tomorrow = dateMap.get(sorted[i + 1]);
        if (
          (today === "N" || today === "N_R") &&
          tomorrow &&
          tomorrow !== "L"
        ) {
          // We expect no such situation
          throw new Error(`min-rest-after-night violated on ${sorted[i]}`);
        }
      }
    }
  });

  it("handles relief shifts correctly", async () => {
    const input: SchedulingInput = {
      people: [
        createPerson("n1", "Alice", "Nurse", "variable", undefined, "WardA"),
        createPerson("n2", "Bob", "Nurse", "variable", undefined, "WardB"),
      ],
      requests: [],
      preferences: [],
      rules: [],
      month,
      year,
      demand: dates.map((d) => createShiftDemand(d, { M: 0, E: 0, N: 1 })),
      reliefRequirements: [createReliefRequirement(dates[0], "N", "WardC", 1)],
    };
    const result = await new LocalScheduler().generate(input);
    const reliefEntry = result.schedule!.entries.find(
      (e) => e.date === dates[0] && e.isRelief,
    );
    expect(reliefEntry).toBeDefined();
    expect(reliefEntry!.targetWard).toBe("WardC");
    // The relief worker must not be from WardC – so only n1 or n2, both not WardC (OK)
    // Also check the base N demand is covered by the relief shift
    const dayEntries = result.schedule!.entries.filter(
      (e) => e.date === dates[0],
    );
    const nCount = dayEntries.filter(
      (e) => e.shiftType === "N" || e.shiftType === "N_R",
    ).length;
    expect(nCount).toBe(1);
  });

  it("handles co‑worker prefer/avoid soft preferences", async () => {
    const input: SchedulingInput = {
      people: [
        createPerson("n1", "A", "Nurse", "variable"),
        createPerson("n2", "B", "Nurse", "variable"),
        createPerson("n3", "C", "Nurse", "variable"),
      ],
      requests: [],
      preferences: [
        createCoWorkerPreference("n1", { preferWith: ["n2"] }, 10),
        createCoWorkerPreference("n1", { avoidWith: ["n3"] }, 10),
      ],
      rules: [],
      month,
      year,
      demand: dates.map((d) => createShiftDemand(d, { M: 1, E: 0, N: 0 })),
    };
    const result = await new LocalScheduler().generate(input);
    // Since demand is only 1 M per day, n1, n2, n3 will rotate.
    // The solver should try to put n1 and n2 together and avoid n1 with n3.
    // We can at least check that no violation of avoid occurs in the schedule.
    const avoidViolation = result.schedule!.entries.some((e) => {
      if (e.personId !== "n1") return false;
      const sameDayN3 = result.schedule!.entries.find(
        (f) => f.date === e.date && f.personId === "n3",
      );
      return !!sameDayN3;
    });
    expect(avoidViolation).toBe(false);
  });

  it("handles recurring off request", async () => {
    const input: SchedulingInput = {
      people: [
        createPerson("n1", "N1", "Nurse", "variable"),
        createPerson("n2", "N2", "Nurse", "variable"),
      ],
      requests: [createRecurringOffRequest("n1", 1)], // Monday off (0=Sun)
      preferences: [],
      rules: [],
      month,
      year,
      demand: dates.map((d) => createShiftDemand(d, { M: 1, E: 0, N: 0 })),
    };
    const result = await new LocalScheduler().generate(input);
    // n1 should never appear on a Monday
    for (const date of dates) {
      const day = new Date(date).getDay();
      if (day === 1) {
        const entry = result.schedule!.entries.find(
          (e) => e.personId === "n1" && e.date === date,
        );
        expect(entry).toBeUndefined();
      }
    }
  });

  it("throws descriptive error on infeasible demand", async () => {
    const input: SchedulingInput = {
      people: [createPerson("n1", "Single", "Nurse", "variable")],
      requests: [createOffDayRequest("n1", { singleDates: [dates[0]] })],
      preferences: [],
      rules: [],
      month,
      year,
      demand: dates.map((d) => createShiftDemand(d, { M: 1, E: 0, N: 0 })),
    };
    const result = await new LocalScheduler().generate(input);
    // Should have solver error violation
    const solverError = result.violations.find(
      (v) => v.ruleName === "solver-error",
    );
    expect(solverError).toBeDefined();
    expect(solverError!.description).toMatch(/infeasible/i);
  });
});

describe("AIExporter", () => {
  it("returns prompt, schema and raw json", async () => {
    const exporter = new AIExporter();
    const result = await exporter.generate({
      people: [createPerson("1", "Bob", "Nurse")],
      requests: [],
      preferences: [],
      rules: [],
      month: 6,
      year: 2026,
      demand: [{ date: "2026-06-01", required: { M: 1, E: 0, N: 0 } }],
    });
    expect(result.exportedData).toHaveProperty("json");
    expect(result.exportedData).toHaveProperty("prompt");
    expect(result.exportedData).toHaveProperty("schema");
    // Basic schema validation
    expect(result.exportedData.schema.$schema).toBe(
      "http://json-schema.org/draft-07/schema#",
    );
  });
});
