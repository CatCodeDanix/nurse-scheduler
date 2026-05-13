# 🏥 Nurse Scheduler

A professional TypeScript library for optimal monthly nursing shift scheduling.  
Uses a **MILP (Mixed‑Integer Linear Programming)** engine under the hood and
supports both **local solving** and **AI‑driven scheduling** via a clean export
format.

> ⚠️ **Development status** – This library is in early development (v0.1.x). It passes its test suite and works for common scheduling scenarios, but has not yet been validated in production environments. Expect breaking changes before v1.0.0. Testing, feedback, and contributions are very welcome.

---

## Features

- 👩‍⚕️ **Person‑centric** – model nurses, head nurses, secretaries (extensible)
- 📅 **Requests** – leave (paid), off‑day, recurring weekly day off
- 📝 **Soft preferences** – shift patterns, co‑worker likes/dislikes, weighted
- ⚖️ **Hard rules** – government & hospital: max hours, no consecutive nights,
  forbidden shift types, minimum rest after night
- 🗓️ **Shift types** – M, E, N, ME, EN, MEN, plus paid leave “L”
- 🚑 **Relief shifts** – schedule staff to other wards when needed
- ⚡ **Dual output mode**
  - **Local** – solve optimally with the built‑in MILP engine
  - **AI export** – generate a prompt & JSON schema to send to any LLM
- 🧩 **Pluggable** – custom rules, obligated‑hours formulas, role extensions
- 📦 **Tree‑shakeable** – ESM & CJS, TypeScript declarations included

---

## Installation

```bash
npm install nurse-scheduler
```

No native modules required – runs in Node.js 18+ and modern browsers (via
bundler).

---

## Quick Start

```js
import {
  LocalScheduler,
  createPerson,
  createShiftDemand,
  getMonthDates,
} from "nurse-scheduler";

const scheduler = new LocalScheduler();

// 1. Define your staff
const people = [
  createPerson("n1", "Alice", "Nurse"),
  createPerson("n2", "Bob", "Nurse"),
];

// 2. Set demand for each day of June 2026
const dates = getMonthDates(2026, 6);
const demand = dates.map((d) => createShiftDemand(d, { M: 1, E: 1, N: 1 }));

// 3. Generate the schedule
const result = await scheduler.generate({
  people,
  requests: [],
  preferences: [],
  rules: [],
  month: 6,
  year: 2026,
  demand,
});

if (result.schedule) {
  console.log(
    "Schedule generated with",
    result.schedule.entries.length,
    "entries",
  );
  console.log("Fairness score:", result.fairnessScore);
}
```

For a complete example, see [`examples/simple.mjs`](examples/simple.mjs).

---

## Key Concepts

### People & Roles

Each person has an `id`, `name`, `role` (e.g., `"Nurse"`, `"HeadNurse"`,
`"Secretary"`, or any custom string), and can be **fixed**‑shift (always works
the same type) or **variable**.

### Requests (Hard constraints)

- **`leave`** – paid leave; counts as a shift with type `"L"`
- **`off-day`** – unpaid day off (no shift assigned)
- **`recurring-off`** – e.g., every Tuesday off

### Preferences (Soft constraints, weighted)

- **Shift pattern** – avoid consecutive night shifts, limit maximum consecutive
  nights, prefer certain shift types
- **Co‑worker** – prefer working with someone, or avoid working with someone

Weights (1–10) let you balance fairness – higher weight = more important.

### Rules (Hard constraints)

Rules come from two sources: `"government"` and `"hospital"`. Built‑in rules:

| Rule name               | Description                                   |
| ----------------------- | --------------------------------------------- |
| `max-monthly-hours`     | Cap monthly hours (pluggable formula)         |
| `no-consecutive-nights` | No two night shifts in a row                  |
| `forbidden-shift-type`  | Ban specific shift types (e.g., `"MEN"`)      |
| `min-rest-after-night`  | At least one full day off after a night shift |

You can add custom rules by registering a checker with `registerRule()`.

A sensible **default government rule set** is exported as
`DEFAULT_GOVERNMENT_RULES` – spread it into your hospital’s rule list.

---

## Dual Scheduling Modes

### LocalScheduler (MILP)

Uses the `glpk.js` solver to find the schedule that minimises total preference
violations while satisfying all hard constraints.

```js
const scheduler = new LocalScheduler();
const { schedule, violations, fairnessScore } = await scheduler.generate(input);
```

Options (constructor):  
`{ timeout?: number, balancingWeight?: number }`

- `timeout` – solver time limit in ms (default 60000)
- `balancingWeight` – reserved for future workload balancing (not yet active)

### AIExporter

Produces a vendor‑neutral data package to send to any AI/LLM:

```js
const exporter = new AIExporter();
const { exportedData } = await exporter.generate(input);
console.log(exportedData.prompt); // Markdown description
console.log(exportedData.schema); // JSON schema for the expected answer
console.log(exportedData.json); // raw input data
```

You can paste the `prompt` into ChatGPT, Claude, etc., and ask it to return a
JSON array matching the `schema`.

---

## API Reference

The library exports:

- **Factories** – `createPerson`, `createLeaveRequest`, …
- **Types** – all TypeScript interfaces (see source or intellisense)
- **Validators** – `validateInput`, `validateSchedule`
- **Scoring** – `calculateFairnessScore`
- **Date utilities** – `getMonthDates`, `isDateInExpression`, `isWeekdayMatch`
- **Default rules** – `DEFAULT_GOVERNMENT_RULES`

Full type documentation is available in the IDE with TypeScript.

---

## Extending to Other Professions

The core abstractions (`Person`, `Shift`, `Request`, `Preference`, `Rule`) are
generic – you can use this library for factory workers, retail, security, etc.
by using custom role strings and shift type definitions.

---

## License

ISC – see [LICENSE](LICENSE).
