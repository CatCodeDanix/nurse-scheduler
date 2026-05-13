import { describe, it, expect } from "vitest";
import { LocalScheduler, AIExporter } from "../src/scheduler";
import { createPerson, createLeaveRequest, createRule } from "../src/factories";
import { SchedulingInput } from "../src/types";

describe("Nurse Scheduler", () => {
  it("generates a schedule for a single fixed nurse", async () => {
    const nurse = createPerson("1", "Alice", "Nurse", "fixed", "M");
    const input: SchedulingInput = {
      people: [nurse],
      requests: [],
      preferences: [],
      rules: [],
      month: 5,
      year: 2026,
    };
    const result = await new LocalScheduler().generate(input);
    expect(result.schedule).toBeDefined();
    expect(result.schedule!.entries.length).toBeGreaterThan(0);
    expect(result.schedule!.entries[0].shiftType).toBe("M");
  });

  it("AI exporter returns prompt and json", async () => {
    const exporter = new AIExporter();
    const result = await exporter.generate({
      people: [createPerson("1", "Bob", "Nurse")],
      requests: [],
      preferences: [],
      rules: [],
      month: 6,
      year: 2026,
    });
    expect(result.exportedData).toHaveProperty("json");
    expect(result.exportedData).toHaveProperty("prompt");
  });
});
