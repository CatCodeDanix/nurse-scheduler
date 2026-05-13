import { SchedulingInput, Schedule, Violation, ScheduleEntry } from "./types";
import { validateInput } from "./inputValidator";
import { evaluateRules } from "./ruleEngine";
import { solveSchedule } from "./solver";
import { calculateFairnessScore } from "./scoring";

// ---------- Scheduler interface ----------
export interface SchedulerResult {
  schedule?: Schedule;
  violations: Violation[];
  fairnessScore: number;
  exportedData?: any;
}

export interface Scheduler {
  generate(input: SchedulingInput): Promise<SchedulerResult>;
}

// ---------- Local scheduler (optimal MILP) ----------
export class LocalScheduler implements Scheduler {
  async generate(input: SchedulingInput): Promise<SchedulerResult> {
    // Pre‑validate input
    const inputViolations = validateInput(input);
    if (inputViolations.some((v) => v.severity === "error")) {
      return { violations: inputViolations, fairnessScore: 0 };
    }

    try {
      const schedule = await solveSchedule(input);
      const violations = evaluateRules(
        schedule,
        input.people,
        input.rules,
        input.holidays,
      );
      const fairnessScore = calculateFairnessScore(schedule, input.preferences);
      return { schedule, violations, fairnessScore };
    } catch (err: any) {
      return {
        violations: [
          {
            ruleName: "solver-error",
            description: err.message,
            severity: "error",
          },
        ],
        fairnessScore: 0,
      };
    }
  }
}

// ---------- AI exporter ----------
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
      demand: input.demand,
      reliefRequirements: input.reliefRequirements ?? [],
    };

    const prompt = buildMarkdownPrompt(payload);
    const schema = buildOutputSchema();

    return {
      violations: [],
      fairnessScore: 0,
      exportedData: { json: payload, prompt, schema },
    };
  }
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

## Demand per day
${data.demand.map((d: any) => `- ${d.date}: M:${d.required.M ?? 0} E:${d.required.E ?? 0} N:${d.required.N ?? 0}`).join("\n")}

## Relief requirements
${data.reliefRequirements.map((r: any) => `- ${r.date}: ${r.baseShiftType} relief to ward ${r.targetWard} (count ${r.count ?? 1})`).join("\n")}

## Preferences (soft)
${data.preferences.map((p: any) => `- ${p.personId}: ${p.type} ${JSON.stringify(p.details)} weight ${p.weight}`).join("\n")}

## Hard Rules
${data.rules.map((r: any) => `- ${r.name} (${r.source}): ${JSON.stringify(r.config ?? {})}`).join("\n")}

## Month: ${data.month}/${data.year}
## Output format: array of { personId, date (YYYY-MM-DD), shiftType, isRelief, targetWard? }`;
}

function buildOutputSchema() {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "array",
    items: {
      type: "object",
      properties: {
        personId: { type: "string" },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        shiftType: { type: "string" },
        isRelief: { type: "boolean" },
        targetWard: { type: "string" },
      },
      required: ["personId", "date", "shiftType", "isRelief"],
    },
  };
}
