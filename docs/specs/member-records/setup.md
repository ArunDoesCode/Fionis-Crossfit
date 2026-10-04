---
module: member-records/setup
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 2
frozen_on: 2026-10-03
owner: Arun
depends_on: [member-records/data-model, member-records/api-contract, member-records/ux, member-records/performance]
---
# Member records · Setup (assessments catalog and settings)

## Summary

The coach decides what is measured: assessments (Body composition, Fitness test, …), their measurements,
units, which direction is better, how often they repeat, plus the gym name, time zone and reminder windows.
Done = the paper forms' items are seeded, the coach can add "Burpees 1 min" without the developer, and
history is never broken by an edit.

## Owns

Rules BR-REC-10, 11, 13, 14, 60…72 · endpoints E07–E15 · tables `gym_settings`, `assessment_types`,
`metrics` · seed content below · screens S14 Settings hub, S15 Assessment setup, S16 Reminders & gym.

## Who can do what

| Action                                                          | Allowed          |
| --------------------------------------------------------------- | ---------------- |
| change settings, add/edit/turn off assessments and measurements | the shared login |

## Flow

| Thing                     | States                    | Rule          |
| ------------------------- | ------------------------- | ------------- |
| Assessment or measurement | On ↔ Off (never deleted) | BR-REC-11, 66 |

## Rules

| ID        | Rule                                                                                                                                                                                                                                                                                           | Example (given → then)                                                        | Check                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| BR-REC-10 | Setup holds assessment types and their sub-items (metrics): name, unit, datatype (number or duration), better = higher/lower, optional plausible min/max, active on/off, sort order. Types seeded: Body composition and Fitness test, with the metrics from the paper forms (see Metric list). | Add "Burpees 1 min", count, higher                                             | E13 creates it; shows in entry form              |
| BR-REC-11 | Datatype and unit are locked once any value exists. Deactivating a metric hides it from entry but keeps its history. Renaming is safe.                                                                                                                                                         | Change Deadlift unit kg → lb after data → blocked                              | E14 → 409`METRIC_LOCKED`; fields shown locked |
| BR-REC-13 | Each assessment type has an interval of N weeks or months. Seeded: Body composition every 1 month, Fitness test every 2 months.                                                                                                                                                                | Setup shows "Every 2 months"                                                   | Seed test                                        |
| BR-REC-14 | A metric may override its type's interval. Effective interval = the metric's own if set, otherwise the type's.                                                                                                                                                                                 | Fran every 3 months inside a 2-month type                                      | Due-engine table (due-list.md)                   |
| BR-REC-60 | Settings: gym name (printed on report cards), time zone (default Asia/Kolkata, decides "today"), "Due soon" window 0–30 days (default 7), "Ends soon" window 0–60 days (default 14).                                                                                                         | Due soon window 45 → "Use 0 to 30 days"                                       | E08 range tests                                  |
| BR-REC-61 | An assessment name is 2–40 characters and unique ignoring case; it repeats every 1–24 weeks or months.                                                                                                                                                                                       | Second "body composition" → "That name is already used"                       | E10 → 409`NAME_TAKEN`                         |
| BR-REC-62 | A measurement name is 2–40 characters, unique inside its assessment; unit up to 12 characters (may be empty); "please check below/above" (min < max) optional.                                                                                                                                | Min 50, max 10 → "Below must be smaller than above"                           | Zod test                                         |
| BR-REC-63 | Better can also be "No direction" (e.g. Height): then reports show the change but no best, improved/worse or leaderboard (Q1).                                                                                                                                                                 | Height 172 → 173 cm → change +1 cm, no "better" word                         | Report test with`better = none`                |
| BR-REC-64 | Numbers are rounded to the measurement's decimals (0–2) when saved; durations are whole seconds; changing decimals later only changes how values are shown.                                                                                                                                   | Decimals 1, typed 95.56 → stored 95.6                                         | Service rounding test                            |
| BR-REC-65 | A measurement may have a report-table place (group + body part: whole body, arms, trunk, legs); the 8 segmental items are seeded with one.                                                                                                                                                     | "Skeletal muscle %" + "Arms" → row Arms, column Skeletal muscle %             | Report card test                                 |
| BR-REC-66 | Assessments and measurements are never deleted, only turned off; off hides them from entry, Home and due dates, while history and reports keep them; turning an assessment off hides all its measurements.                                                                                     | Turn off Fitness test → no fitness rows on Home; report card still shows Fran | E11/E14 + due test                               |
| BR-REC-67 | "Move up / Move down" sets the order used in forms, the report card and lists.                                                                                                                                                                                                                 | Move Fran above 5K → form shows Fran first                                    | E12/E15 test                                     |
| BR-REC-68 | The seed creates the items below only on an empty catalog and never overwrites a coach's later edits.                                                                                                                                                                                          | Coach renamed "Hang time" → re-running seed keeps the new name                | Seed run twice → no change                      |
| BR-REC-69 | Units are labels only; the app never converts units (weights are always kg, BR-REC-12).                                                                                                                                                                                                        | Unit "lb" typed on a new item → stored as label "lb", no maths                | Review: no conversion code                       |
| BR-REC-70 | Changing a repeat interval shows "This changes due dates for all members" before saving, and Home reflects it at once.                                                                                                                                                                         | Fitness 2 → 3 months → 20 members leave Overdue                              | UI confirm + due test                            |
| BR-REC-71 | Changing "better" on a measurement that has values asks for confirmation, because "best" and leaderboards change for past results.                                                                                                                                                             | Weight lower → higher → confirm sheet                                        | UI test                                          |
| BR-REC-72 | Every device sees setup changes the next time it opens a form (catalog revalidated with ETag, 304 when unchanged).                                                                                                                                                                             | Coach adds Burpees on tablet → phone's next form shows it                     | E09 304/200 test                                 |

## Metric list (seed, from the paper sheets — v1 text, unchanged; its Q1/Q3 are the parent's v1 answers)

- **Body composition (monthly):** height cm, weight kg, BMI, body fat %, visceral fat, resting metabolism kcal, body age; segmental subcutaneous fat % and skeletal muscle % for whole body / arms / trunk / legs.
- **Fitness test (every 2 months):** push-ups, hang time (duration), pull-ups, squats in 1 min, plank (duration), deadlift kg, back squat kg, chest press kg, shoulder press kg, flexibility, 5K run (duration), Filthy 50 (duration), Fran (duration), CrossFit total kg.
- Duration tests (Fran, Filthy 50, 5K) are mm:ss; flexibility is cm (Q3). SCW and SMW are dropped (Q1); a coach can add them later in Setup.

## Seed detail (proposed defaults; ranges are "please check" limits, editable — Q3)

| Assessment       | Measurement                                              | Kind   | Unit    | Dec | Better    | Check range    | Report table               |
| ---------------- | -------------------------------------------------------- | ------ | ------- | --- | --------- | -------------- | -------------------------- |
| Body composition | Height                                                   | number | cm      | 1   | none (Q1) | 120–220       | —                         |
|                  | Weight                                                   | number | kg      | 1   | lower     | 30–250        | —                         |
|                  | BMI                                                      | number |         | 1   | lower     | 12–60         | —                         |
|                  | Body fat                                                 | number | %       | 1   | lower     | 3–60          | —                         |
|                  | Visceral fat                                             | number | level   | 1   | lower     | 1–30          | —                         |
|                  | Resting metabolism                                       | number | kcal    | 0   | higher    | 800–4000      | —                         |
|                  | Body age                                                 | number | years   | 0   | lower     | 10–99         | —                         |
|                  | Subcutaneous fat — whole body / arms / trunk / legs (4) | number | %       | 1   | lower     | 1–60          | Subcutaneous fat % × part |
|                  | Skeletal muscle — whole body / arms / trunk / legs (4)  | number | %       | 1   | higher    | 10–60         | Skeletal muscle % × part  |
| Fitness test     | Push-ups, Pull-ups, Squats in 1 min                      | number | reps    | 0   | higher    | 0–200         | —                         |
|                  | Hang time, Plank                                         | time   | min:sec | —  | higher    | 0:00–15:00    | —                         |
|                  | Deadlift, Back squat, Chest press, Shoulder press        | number | kg      | 1   | higher    | 0–400         | —                         |
|                  | Flexibility                                              | number | cm      | 1   | higher    | −30–60       | —                         |
|                  | 5K run                                                   | time   | min:sec | —  | lower     | 12:00–1:30:00 | —                         |
|                  | Filthy 50                                                | time   | min:sec | —  | lower     | 10:00–1:30:00 | —                         |
|                  | Fran                                                     | time   | min:sec | —  | lower     | 1:30–30:00    | —                         |
|                  | CrossFit total                                           | number | kg      | 1   | higher    | 0–900         | —                         |

## Screens

S14 Settings hub (`/admin/settings`): rows Assessments › · Reminders & gym › · Account › (auth) · Export
data › (progress) · Theme (System / Light / Dark). Desktop: same list, 720 px wide.
S15 Assessment setup (`/admin/settings/assessments`, `/admin/settings/assessments/[typeId]`).

```
+--------------------------------+
| <  Body composition     [Edit] |
| Repeat every 1 month           |
| Weight · kg · lower better [^v]|
| Height · cm · no direction [^v]|
| Fran · min:sec · every 3 months|
| Burpees · off                  |
| [     + Add measurement      ] |
+--------------------------------+
```

Measurement sheet (bottom sheet on phones, dialog on desktop):

```
+--------------------------------+
| Name *      [ Weight         ] |
| Kind *      (Number)(Time)     |  <- locked once values exist
| Unit        [ kg ]             |  <- locked once values exist
| Decimals    (0)(1)(2)          |
| Better      (Higher)(Lower)(None)
| Please check below [  ] above [  ]
| Repeat      (Same as assessment)(Own: [3] months)
| Report table (none) or group + part
| On          [x]                |
| [ Cancel ]          [ Save ]   |
+--------------------------------+
```

S16 Reminders & gym (`/admin/settings/general`): gym name, time zone, "Due soon" days, "Ends soon" days, [Save].

## Build clarifications (v2, Stream C coordinator, 2026-10-04 — owner to confirm at merge; no change of intent)

| # | Rule | Clarification |
|---|---|---|
| C1 | 60 | Gym name is trimmed, 2–60 characters. Time zone must be an IANA name the server knows (e.g. `Asia/Kolkata`); anything else → 400 `VALIDATION_ERROR`. Lead days are whole numbers. |
| C2 | 61, 62 | Assessment, measurement and report-group names are trimmed before checking and saving; "unique ignoring case" compares the trimmed names. Report group: 2–40 characters. |
| C3 | 10, 64 | A Time measurement always has unit `min:sec` and 0 decimals (the server sets them, whatever the request sends; the sheet hides both for Time). Switching Time → Number without sending a unit leaves the unit empty. Check ranges of Time measurements are in seconds (BR-REC-153). |
| C4 | 11 | `METRIC_LOCKED` only when datatype or unit would really change; sending the stored value again is fine. |
| C5 | 66 | Turning an assessment off does not change its measurements' own On/Off; it hides them while it is off. E09 without `includeInactive` leaves out off assessments and off measurements; with `includeInactive=true` it returns all, each with its own `isActive`. |
| C6 | 11 | `hasValues`: a measurement has at least one stored value; an assessment has at least one stored value in any of its measurements. |
| C7 | 67 | E12 lists every assessment (on and off) once; E15 lists every measurement of that assessment (on and off) once; anything else → 400 `VALIDATION_ERROR`. New assessments and measurements are added last and On. |
| C8 | 62 | On E14 the "please check" pair and the two both-or-neither pairs (own repeat; report group + part) are checked against the stored values when only one side is sent → 400 `VALIDATION_ERROR`; this includes clearing one side alone (`intervalUnit: null`, `tableGroup: null` or `tablePart: null` while the other stays stored). |
| C9 | 64 | Setup ships the pure rounding function (`backend/src/lib/domain/metric-value.ts`): numbers round half away from zero to the measurement's decimals (95.56 → 95.6, −2.25 → −2.3), Time to whole seconds. The assessments stream calls it when saving (BR-REC-76). Changing decimals (E14) never rewrites stored values. |
| C11 | 61, 62, 67 | Two writes racing on the same name end with one success and 409 `NAME_TAKEN` (never a 500); two parallel adds get different sort orders. |
| C10 | 158 | Change-log actions: `settings.update`, `assessment_type.create`, `assessment_type.update`, `assessment_type.reorder`, `metric.create`, `metric.update`, `metric.reorder`. |

## Not now

Custom membership plans, editable warning % (30%) and "no change" % (1%) — fixed for now (v1 Q4), unit conversion, calculated measurements.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Height has no "better" direction. | **A** add "No direction": Height = none, Weight = lower / B keep only higher/lower | **A** → BR-REC-63 |
| Q2 | BMI and CrossFit total are… | **A** typed from the scale/paper / B calculated by the app | **A** |
| Q3 | The "please check" ranges in the seed table are… | **A** fine, the coach adjusts later / B review together first | **A** |
| Q4 | Gym time zone | **A** Asia/Kolkata / B other | **A** |
| Q5 | Gym name on report cards | **A** "Fionis CrossFit" / B other | **A** |

## Changelog

- 2026-10-03 v0 — draft, split out of member-records v2; carries BR-REC-10, 11, 13, 14 and the Metric list from v1 unchanged
- 2026-10-03 v0 — answers folded: all as recommended, no rule changes
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-04 v2 — clarified during build (Stream C; owner to confirm at merge; no change of intent): section
  "Build clarifications" C1–C11 (gym name 2–60, IANA time zone, trimmed names, Time = `min:sec` + 0 decimals,
  lock only on a real change, off assessment hides without cascading, `hasValues`, full order lists, pair checks on
  edit, rounding function for the assessments stream, change-log action names); BR-REC-11 example changed from Fran
  (a Time measurement, whose unit is always `min:sec`) to Deadlift kg → lb; C8 also covers clearing one side alone; C11 name races → 409
