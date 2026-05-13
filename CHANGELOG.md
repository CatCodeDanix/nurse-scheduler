# Changelog

## 1.0.0 – Initial release

- MILP‑based scheduling engine with `glpk.js`
- Local and AI export scheduling modes
- Hard rules: max‑monthly‑hours, no‑consecutive‑nights, forbidden‑shift‑type,
  min‑rest‑after‑night
- Soft preferences with weights
- Shift types M, E, N, combinations, leave, relief
- Request types: leave, off‑day, recurring‑off
- Pluggable rule engine and obligated hours formulas
- Input validation and schedule verification
- Full TypeScript support with ESM/CJS dual build
