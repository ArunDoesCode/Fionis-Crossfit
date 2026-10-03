---
module: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-10-03
owner: Arun
depends_on: []
---
# Member records (assessment data entry + reports) — MVP

> Standalone first slice: digitise the paper assessment binder. Later the full app builds on `members`.

## Summary

A trainer enters each member's body-composition and fitness-test results, plus their membership term. Home
shows who is overdue for an assessment and whose membership is expiring. Each member has a report card;
the owner sees gym-wide progress. Done = the whole paper binder is entered and the three reports are right.

## Who can do what

| Action                                                         | Allowed                         |
| -------------------------------------------------------------- | ------------------------------- |
| everything (members, memberships, assessments, setup, reports) | the one shared login (no roles) |

## Flow

| Thing                              | States (derived from dates, never typed)          | Rule          |
| ---------------------------------- | ------------------------------------------------- | ------------- |
| Membership                         | Active → Expiring (≤ lead days left) → Expired | BR-REC-08     |
| Assessment due (per member + type) | Not due → Upcoming → Overdue → Done (saved)    | BR-REC-16, 17 |

## Rules

IDs are permanent (strike out, never renumber).

| ID        | Rule                                                                                                                                                                                                                                                                                                                        | Example (given → then)                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| BR-REC-01 | Every page except login needs the shared login. 5 wrong passwords lock login for 15 minutes; the error never says which part was wrong.                                                                                                                                                                                     | 5 bad tries → locked 15 min                            |
| BR-REC-02 | Password is changed in Setup with the current password; minimum 8 characters.                                                                                                                                                                                                                                               | New "abc" → rejected                                   |
| BR-REC-03 | A member needs full name, phone, date of birth, sex and join date. Email, objective (fat loss / strength / general fitness / other) and notes are optional. Age is always computed from date of birth.                                                                                                                      | DOB 1982-05-10 → age 44 on 2026-10-03                  |
| BR-REC-04 | Same name is allowed. Same phone as another member shows a duplicate warning but can be saved (families share phones).                                                                                                                                                                                                      | Two "Surya Pratap", different phones → both saved      |
| BR-REC-05 | Creating a member also needs a first membership period (plan + start date). Past start dates are allowed for historical entry.                                                                                                                                                                                              | Joined 2025-06-01, annual → saved                      |
| BR-REC-06 | Members are archived, never deleted. Archived members vanish from search and Home; history stays; they can be restored.                                                                                                                                                                                                     | Archive → not in search; restore → back               |
| BR-REC-07 | Search needs 2+ characters and matches part of name, phone or email. Each result shows name, phone, last assessment date and membership status.                                                                                                                                                                             | "sur" → both Suryas with phones                        |
| BR-REC-08 | Plan = Monthly 1, Quarterly 3, Half-annual 6, Annual 12 calendar months. End = start + months − 1 day (clamped to month end). Status: Active; Expiring when end is within the expiry lead days (Setup, default 14); Expired when end has passed and no later period exists. Home lists Expiring and recently Expired.      | Monthly from 15 Jan → ends 14 Feb                      |
| BR-REC-09 | Renewal adds a new period (default start = previous end + 1 day). A member's periods may not overlap. Periods can be edited, not deleted.                                                                                                                                                                                   | Overlap with previous → rejected                       |
| BR-REC-10 | Setup holds assessment types and their sub-items (metrics): name, unit, datatype (number or duration), better = higher/lower, optional plausible min/max, active on/off, sort order. Types seeded: Body composition and Fitness test, with the metrics from the paper forms (see Metric list).                              | Add "Burpees 1 min", count, higher                      |
| BR-REC-11 | Datatype and unit are locked once any value exists. Deactivating a metric hides it from entry but keeps its history. Renaming is safe.                                                                                                                                                                                      | Change Fran unit after data → blocked                  |
| BR-REC-12 | Duration values are typed as mm:ss, stored in seconds and shown as mm:ss. Weights are stored in kg only.                                                                                                                                                                                                                    | Plank "2:02" → 122 s                                   |
| BR-REC-13 | Each assessment type has an interval of N weeks or months. Seeded: Body composition every 1 month, Fitness test every 2 months.                                                                                                                                                                                             | Setup shows "Every 2 months"                            |
| BR-REC-14 | A metric may override its type's interval. Effective interval = the metric's own if set, otherwise the type's.                                                                                                                                                                                                              | Fran every 3 months inside a 2-month type               |
| BR-REC-15 | Due date = member's last recorded value of that metric + effective interval (calendar months). Never recorded → due on the join date. Calculated on the fly, never stored, so a changed interval updates everyone at once.                                                                                                 | Last Fran 2026-08-10, 3 months → due 2026-11-10        |
| BR-REC-16 | Home Overdue/Upcoming shows one row per member per type: type name, days overdue, chips of the due sub-items. Overdue = due date before today; Upcoming = within the lead window (Setup, default 7 days). Most overdue first. A type is done when every due metric has a value; blanks stay due.                            | 3 of 5 due items entered → row stays, 2 chips          |
| BR-REC-17 | Members who are archived or Expired are excluded from Overdue/Upcoming. Expiring members stay in.                                                                                                                                                                                                                           | Expired yesterday → not listed                         |
| BR-REC-18 | "Flag for assessment" puts a member + type in Overdue regardless of date; it clears when that assessment is saved. "Snooze" hides a row until a chosen date, at most 90 days ahead.                                                                                                                                         | Snooze 30 days → hidden, returns after                 |
| BR-REC-19 | An assessment = member + type + date, not in the future (earlier than the join date shows a warning). One per member + type + date: saving again edits it. Partial entry is allowed; blank fields are simply not recorded. The date can be marked "estimated" for undated paper columns. Delete needs confirmation.         | Save body comp twice on 2025-12-30 → one record        |
| BR-REC-20 | The entry form shows the previous value and the change next to each field, in the configured unit.                                                                                                                                                                                                                          | Weight field shows "prev 95.5 kg"                       |
| BR-REC-21 | A value that jumps more than 30% from the previous one, or falls outside the metric's min/max, shows "please confirm" but can still be saved.                                                                                                                                                                               | Visceral fat 8 → 17.5 → warning, saved                |
| BR-REC-22 | Report card (one printable page): header (name, age, plan, join date) and, per metric, first / latest / best / change with a trend chart. "Best" follows the better-direction. Body composition adds the latest segmental table. Under 2 points shows the value only.                                                       | Fran 5:20 → 4:10 → best 4:10, change −1:10           |
| BR-REC-23 | Gym-wide progress: average change since each member's first reading of a metric, filterable by join month, plan, sex and age band; counts of improved / plateaued (< 1% change) / regressed; latest-value leaderboard per metric split by sex; active members by plan. Only members with 2+ readings count, and n is shown. | Fat % filter "joined Jan 2026" → avg −2.1 pts, n = 12 |
| BR-REC-24 | Everything is exportable to CSV (members, memberships, measurements) with one row per value.                                                                                                                                                                                                                                | Export → one row per metric per date                   |

## Metric list (seed, from the paper sheets)

- **Body composition (monthly):** height cm, weight kg, BMI, body fat %, visceral fat, resting metabolism kcal, body age; segmental subcutaneous fat % and skeletal muscle % for whole body / arms / trunk / legs.
- **Fitness test (every 2 months):** push-ups, hang time (duration), pull-ups, squats in 1 min, plank (duration), deadlift kg, back squat kg, chest press kg, shoulder press kg, flexibility, 5K run (duration), Filthy 50 (duration), Fran (duration), CrossFit total kg.
- Duration tests (Fran, Filthy 50, 5K) are mm:ss; flexibility is cm (Q3). SCW and SMW are dropped (Q1); a coach can add them later in Setup.

## Not now

Food plan, lifestyle, medical history, payments, freezes/pauses, roles, attendance, member app, TV, insights and
personalisation rules (plateau flags, ratios, risk bands, personalised loads), server-side PDF, CSV import, source-photo attachment.

## Questions for you

| #  | Question                                                                                                      | Options                                                                                                    | Answer |
| -- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| Q1 | What do SCW and SMW on the paper mean, and are they tracked?                                                  | **A** ask the coach, add later (recommended) / B drop them                                           | B      |
| Q2 | Q1–Q4 columns on paper have no dates. How do we date historical entries?                                     | **A** join date + 3-month steps, marked "estimated" (recommended) / B ask the trainer for real dates | A      |
| Q3 | Fran, Filthy 50, 5K: are the written numbers min:sec (e.g. "3:20")? Flexibility: what is measured (cm reach)? | **A** mm:ss, flexibility in cm (recommended) / B other                                               | A      |
| Q4 | Warning at a 30% jump and "plateau" at < 1% change: right for the owner?                                      | **A** yes, adjustable later (recommended) / B other values                                           | A      |
| Q5 | Lead windows: Upcoming 7 days, Expiring 14 days.                                                              | **A** keep (recommended) / B other                                                                   | A      |

## Changelog

- 2026-10-03 v0 — draft from owner scope discussion (benchmark step skipped: a records tool, not class scoring)
- 2026-10-03 v1 — frozen; Q1–Q5 answered (SCW/SMW dropped, others as recommended)
