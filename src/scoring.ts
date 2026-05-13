import {
  Schedule,
  Preference,
  ShiftPatternPreference,
  CoWorkerPreference,
} from "./types";

/**
 * Calculate penalty from violated preferences.
 * Lower is better; 0 means all soft preferences satisfied.
 */
export function calculateFairnessScore(
  schedule: Schedule,
  preferences: Preference[],
): number {
  let penalty = 0;
  for (const pref of preferences) {
    if (isPreferenceViolated(schedule, pref)) {
      penalty += pref.weight;
    }
  }
  return penalty;
}

function isPreferenceViolated(schedule: Schedule, pref: Preference): boolean {
  switch (pref.type) {
    case "shift-pattern":
      return isShiftPatternViolated(schedule, pref);
    case "co-worker":
      return isCoWorkerViolated(schedule, pref);
    default:
      return false;
  }
}

function isShiftPatternViolated(
  schedule: Schedule,
  pref: ShiftPatternPreference,
): boolean {
  const entries = schedule.entries
    .filter((e) => e.personId === pref.personId)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (pref.details.avoidConsecutive) {
    for (let i = 1; i < entries.length; i++) {
      if (
        entries[i - 1].shiftType === pref.details.avoidConsecutive &&
        entries[i].shiftType === pref.details.avoidConsecutive
      ) {
        return true;
      }
    }
  }

  if (pref.details.maxConsecutiveNights) {
    let count = 0;
    for (const e of entries) {
      if (e.shiftType === "N" || e.shiftType === "N_R") count++;
      else count = 0;
      if (count > pref.details.maxConsecutiveNights) return true;
    }
  }

  if (pref.details.preferredShifts) {
    const allowed = new Set(pref.details.preferredShifts);
    for (const e of entries) {
      if (!allowed.has(e.shiftType)) return true;
    }
  }
  return false;
}

function isCoWorkerViolated(
  schedule: Schedule,
  pref: CoWorkerPreference,
): boolean {
  const byDate = new Map<string, Set<string>>();
  for (const e of schedule.entries) {
    const set = byDate.get(e.date) ?? new Set();
    set.add(e.personId);
    byDate.set(e.date, set);
  }

  for (const [, workingIds] of byDate) {
    if (!workingIds.has(pref.personId)) continue;

    if (pref.details.avoidWith) {
      for (const avoidId of pref.details.avoidWith) {
        if (workingIds.has(avoidId)) return true;
      }
    }

    if (pref.details.preferWith) {
      for (const preferId of pref.details.preferWith) {
        if (!workingIds.has(preferId)) return true;
      }
    }
  }
  return false;
}
