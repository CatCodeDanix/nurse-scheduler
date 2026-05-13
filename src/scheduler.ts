import { SchedulingInput, Schedule, Violation, ScheduleEntry } from "./types";
import { getMonthDates, isDateInExpression, isWeekdayMatch } from "./dateUtils";
import { validateSchedule } from "./validator";
import { calculateFairnessScore } from "./scoring";

export interface SchedulerResult {
  schedule?: Schedule;
  violations: Violation[];
  fairnessScore: number;
  exportedData?: any;
}

export interface Scheduler {
  generate(input: SchedulingInput): Promise<SchedulerResult>;
}

export class LocalScheduler implements Scheduler {
  async generate(input: SchedulingInput): Promise<SchedulerResult> {
    const dates = getMonthDates(input.year, input.month);
    const entries: ScheduleEntry[] = [];

    for (const date of dates) {
      for (const person of input.people) {
        if (hasRequestOnDate(person.id, date, input.requests)) continue;

        const shiftType =
          person.assignmentType === "fixed" && person.fixedShiftType
            ? person.fixedShiftType
            : "M";
        entries.push({
          personId: person.id,
          date,
          shiftType,
          isRelief: false,
        });
      }
    }

    const schedule: Schedule = {
      month: input.month,
      year: input.year,
      entries,
    };
    const violations = validateSchedule(schedule, input.people, input.rules);
    const fairnessScore = calculateFairnessScore(schedule, input.preferences);

    return { schedule, violations, fairnessScore };
  }
}

export class AIExporter implements Scheduler {
  async generate(input: SchedulingInput): Promise<SchedulerResult> {
    const payload = {
      instruction:
        "You are a nursing shift scheduler. Generate a valid schedule respecting all hard rules and minimizing preference violations.",
      people: input.people,
      requests: input.requests,
      preferences: input.preferences,
      rules: input.rules,
      month: input.month,
      year: input.year,
      holidays: input.holidays ?? [],
    };

    const prompt = buildMarkdownPrompt(payload);

    return {
      violations: [],
      fairnessScore: 0,
      exportedData: { json: payload, prompt },
    };
  }
}

// Helper
function hasRequestOnDate(
  personId: string,
  date: string,
  requests: SchedulingInput["requests"],
): boolean {
  return requests.some((r) => {
    if (r.personId !== personId) return false;
    switch (r.type) {
      case "leave":
      case "off-day":
        return isDateInExpression(date, r.dates);
      case "recurring-off":
        return isWeekdayMatch(date, r.recurringWeekday);
    }
  });
}

function buildMarkdownPrompt(data: any): string {
  return `# Nursing Shift Scheduling Task

## People
${data.people.map((p: any) => `- ${p.name} (${p.role}), ${p.assignmentType}${p.fixedShiftType ? " always " + p.fixedShiftType : ""}, homeWard: ${p.homeWard ?? "none"}`).join("\n")}

## Requests
${data.requests
  .map((r: any) => {
    if (r.type === "recurring-off")
      return `- ${r.personId}: recurring off every weekday ${r.recurringWeekday} (priority ${r.priority})`;
    return `- ${r.personId}: ${r.type} dates=${JSON.stringify(r.dates)} priority ${r.priority}`;
  })
  .join("\n")}

## Preferences (soft)
${data.preferences.map((p: any) => `- ${p.personId}: ${p.type} ${JSON.stringify(p.details)} weight ${p.weight}`).join("\n")}

## Hard Rules
${data.rules.map((r: any) => `- ${r.name} (${r.source}): ${JSON.stringify(r.config ?? {})}`).join("\n")}

## Month: ${data.month}/${data.year}
## Output format: array of { personId, date (YYYY-MM-DD), shiftType, isRelief, targetWard? }`;
}
