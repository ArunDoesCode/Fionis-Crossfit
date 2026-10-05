---
module: member-records/setup
spec: docs/specs/member-records/setup.md
last_verified_commit: 9d78023
last_verified_on: 2026-10-04
depends_on: []
---

# Member records · setup (Stream C) — as-built sub-map

> Index and cross-stream traps: [member-records.md](../member-records.md). Rules BR-REC-10, 11, 13, 14, 60–72; clarifications `setup-C1…C13` (setup.md → Build clarifications).

## Summary and API
Gym settings and the assessments catalog: assessments (types) and their measurements (metrics), order, On/Off, repeat intervals, check ranges, report-table
groups. Screens S14 Settings hub, S15 Assessment setup (+ detail), S16 Reminders & gym. Ships the pure rounding function
`roundMetricValue`, which assessments calls on every save.
Endpoints: E07 settings (read, ETag) · E08 update settings · E09 catalog (ETag) · E10 add assessment · E11 edit assessment · E12 reorder assessments · E13 add measurement · E14 edit measurement · E15 reorder measurements.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| backend | `backend/src/{routes/setup,controller/setupController,service/setupService,service/setupRules,repository/setupRepository}.ts`, `types/setup.types.ts` | `setupService.{getSettings,updateSettings,listCatalog,createType,updateType,reorderTypes,createMetric,updateMetric,reorderMetrics}`; pure `setupRules.ts`: `newMetricFields`, `editedMetricFields` (C3), `metricIssues` (C8), `changesKindOrUnit` (C4), `listsEveryIdOnce` (C7) |
| domain | `backend/src/lib/domain/metric-value.ts` | `roundMetricValue(value, datatype, decimals)`: half away from zero on the decimal digits (BR-REC-76) |
| admin lib | `frontend/src/lib/{validators/setup.ts,setup/{describe,text,form,timezones}.ts,api/setup/{fetchers,queries}.ts}` | `setupKeys`; `settingsQueryOptions`, `assessmentTypesQueryOptions` (`staleTime: 0`, catalog `pageSize=100`) |
| admin ui | `frontend/src/components/{views,pages}/setup/*`, routes `app/(app)/admin/settings/{page.tsx,general,assessments/[typeId]}` | `SetupSheet` (edit sheet + confirm step), `SheetBody`, the theme choice in SettingsHubView (System/Light/Dark), `SettingsHubView`, `GymSettingsView`, `AssessmentSetupView`, `AssessmentDetailView` |

## Gotchas
- E07 is a pure read (setup-C13): no `gym_settings` row → the schema defaults (`SETTINGS_DEFAULTS`, read from the Drizzle column defaults); only E08 (`lockSettings`) and `seed` create the row.
- Locks (setup-C11): E10–E12 take `pg_advisory_xact_lock(hashtext('setup.assessment_types'))`; E13 and E15 lock the type row `FOR UPDATE`; E14 locks the metric row (blocks a concurrent value insert, so `hasValues` cannot flip). Unique-index 23505 → 409 `NAME_TAKEN`; 23514 on the check range → 400.
- E09 `hasValues` is built with `exists(db.select()…)` (`setupRepository.hasStoredValue`): a text sub-select loses its table names (index → Drizzle).
- Audit: one `audit_log` row per successful write (entities `settings` id "1", `assessment_type`, `metric`; create rows hold the new item, reorder rows `{ order: [ids] }`); a no-op write still logs a row with null before/after; no ip/device (setup-C10).
- Time → Number switch with no unit and no decimals in the body takes the creation defaults (unit "", decimals 1); a Time measurement is always `min:sec` + 0 decimals (setup-C3). E14 error order: 404 → C8 400 → `METRIC_LOCKED` → `NAME_TAKEN`.
- Admin: a confirmation is a step inside the one `SetupSheet` (index → Sheets and Back). A hidden (not unmounted) form keeps its state, but `focus()` on it fails until visible (`flushSync` first).
- Theme follows the device (`defaultTheme="system"`); the manual choice is the theme choice in SettingsHubView on S14 (the shared `ThemeToggle` is a two-state icon button and cannot offer System).
- Setup's `DurationControl` ignores the shared `DurationField` `status`, and `NumberControl` passes no `allowNegative`: an iOS phone cannot type a minus in a check range (#19, #21).

## Tests and open issues
`backend/tests/setup/` (`settings-empty` covers setup-C13; seed rules in `backend/tests/scripts/seed.test.ts`), `frontend/tests/setup/`.
Manual: `.pipeline/member-records-setup/checklist.md` (S14–S16, sheet wiring of BR-REC-70, 71, real-server items).
Open issues: [#19](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/19) and [#21](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/21) setup callers adopt the shared field fixes · [#18](https://github.com/ArunDoesCode/Fionis-Crossfit/issues/18) sheet scrolling / Back stack.

## History
2026-10-04 · #23 (`8c1ba1c`) · Stream C built: E07–E15, `roundMetricValue`, S14–S16; setup.md v2 (clarifications C1–C13).
