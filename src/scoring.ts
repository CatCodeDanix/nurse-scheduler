import {
  Schedule,
  Preference,
  ShiftPatternPreference,
  CoWorkerPreference,
} from "./types";

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
  return penalty; // lower is better; 0 means perfect fairness for given prefs
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
      if (e.shiftType === "N") count++;
      else count = 0;
      if (count > pref.details.maxConsecutiveNights) return true;
    }
  }

  if (pref.details.preferredShifts) {
    for (const e of entries) {
      if (!pref.details.preferredShifts.includes(e.shiftType)) {
        return true; // a shift outside preference exists
      }
    }
  }
  return false;
}

function isCoWorkerViolated(
  schedule: Schedule,
  pref: CoWorkerPreference,
): boolean {
  const byDate = new Map<string, string[]>();
  for (const e of schedule.entries) {
    const ids = byDate.get(e.date) || [];
    ids.push(e.personId);
    byDate.set(e.date, ids);
  }

  for (const [, ids] of byDate) {
    const personWorks = ids.includes(pref.personId);
    if (!personWorks) continue;

    if (pref.details.avoidWith) {
      for (const avoidId of pref.details.avoidWith) {
        if (ids.includes(avoidId)) return true;
      }
    }

    if (pref.details.preferWith) {
      for (const preferId of pref.details.preferWith) {
        if (!ids.includes(preferId)) return true;
      }
    }
  }
  return false;
}
