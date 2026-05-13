import {
  LocalScheduler,
  createPerson,
  createShiftDemand,
  createLeaveRequest,
  createShiftPreference,
  getMonthDates,
  DEFAULT_GOVERNMENT_RULES,
} from "nurse-scheduler";

async function main() {
  const year = 2026;
  const month = 6;
  const dates = getMonthDates(year, month);

  // Staff
  const people = [
    createPerson("1", "Alice", "Nurse", "variable"),
    createPerson("2", "Bob", "Nurse", "variable"),
    createPerson("3", "Carol", "Nurse", "fixed", "M"),
  ];

  // Demand: 2 morning, 2 evening, 1 night every day
  const demand = dates.map((d) => createShiftDemand(d, { M: 2, E: 2, N: 1 }));

  // Requests
  const requests = [
    createLeaveRequest("1", { singleDates: [dates[5], dates[6]] }),
  ];

  // Preferences
  const preferences = [
    createShiftPreference("2", { avoidConsecutive: "N" }, 8),
  ];

  // Rules: government defaults + hospital rule banning MEN shifts
  const rules = [
    ...DEFAULT_GOVERNMENT_RULES,
    {
      source: "hospital",
      name: "forbidden-shift-type",
      config: { forbiddenShiftTypes: ["MEN"] },
    },
  ];

  const scheduler = new LocalScheduler({ timeout: 30000 });
  const result = await scheduler.generate({
    people,
    requests,
    preferences,
    rules,
    month,
    year,
    demand,
  });

  if (result.schedule) {
    console.log(
      `✅ Schedule generated with ${result.schedule.entries.length} shifts.`,
    );
    console.log(`Fairness score: ${result.fairnessScore}`);
    console.log(
      `Violations: ${result.violations.length} (${result.violations.filter((v) => v.severity === "error").length} errors)`,
    );
    // Print first 5 entries as example
    for (const e of result.schedule.entries.slice(0, 5)) {
      console.log(
        `${e.date} | ${e.personId} | ${e.shiftType}${e.isRelief ? " (relief)" : ""}`,
      );
    }
  } else {
    console.error("❌ No schedule. Violations:");
    for (const v of result.violations) {
      console.error(` - [${v.severity}] ${v.ruleName}: ${v.description}`);
    }
  }
}

main().catch(console.error);
