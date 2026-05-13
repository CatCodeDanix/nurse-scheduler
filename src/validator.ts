import { Schedule, Person, Rule, Violation } from "./types";
import { evaluateRules } from "./ruleEngine";

/**
 * Validate a schedule against a set of rules.
 * Uses the pluggable rule engine.
 */
export function validateSchedule(
  schedule: Schedule,
  people: Person[],
  rules: Rule[],
  holidays?: string[],
): Violation[] {
  return evaluateRules(schedule, people, rules, holidays);
}
