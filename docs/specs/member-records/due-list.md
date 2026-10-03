---
module: member-records/due-list
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-10-03
owner: Arun
depends_on: [member-records/setup, member-records/members, member-records/assessments, member-records/data-model, member-records/api-contract, member-records/ux, member-records/performance]
---
# Member records · Who is due (Home and due dates)

## Summary

Home answers one question when a trainer opens the app: who needs an assessment now. Due dates are worked out
on the fly from the last reading and the repeat interval, never stored. Trainers can push someone up
("Assess soon") or hide them for a while ("Remind me later"). Done = Home is right for every example below
and a trainer reaches the entry form for an overdue member in 2 taps.

## Owns

Rules BR-REC-15…18, 93…105 · endpoints E31–E34 · table `due_overrides` · pure function `computeDue` ·
screens S2 Home (frame + the two due sections), S3 Due list, row action sheet, the "Assessments" block on
the member page.

## Who can do what

| Action                                                     | Allowed          |
| ---------------------------------------------------------- | ---------------- |
| view due lists, Assess soon, Remind me later, clear either | the shared login |

## Flow

| Thing               | States (from dates, never typed)                                  | Rule               |
| ------------------- | ----------------------------------------------------------------- | ------------------ |
| Member + assessment | Not due → Due soon → Overdue → Done (saved, next cycle starts) | BR-REC-15, 16      |
| Override            | none ↔ Assess soon · none ↔ Reminder until a date              | BR-REC-18, 98…100 |

## Rules

| ID         | Rule                                                                                                                                                                                                                                                                                             | Example (given → then)                                  | Check                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------ |
| BR-REC-15  | Due date = member's last recorded value of that metric + effective interval (calendar months). Never recorded → due on the join date. Calculated on the fly, never stored, so a changed interval updates everyone at once.                                                                      | Last Fran 2026-08-10, 3 months → due 2026-11-10         | `computeDue` table below                             |
| BR-REC-16  | Home Overdue/Upcoming shows one row per member per type: type name, days overdue, chips of the due sub-items. Overdue = due date before today; Upcoming = within the lead window (Setup, default 7 days). Most overdue first. A type is done when every due metric has a value; blanks stay due. | 3 of 5 due items entered → row stays, 2 chips           | Cases 8, 9                                             |
| BR-REC-17  | Members who are archived or Expired are excluded from Overdue/Upcoming. Expiring members stay in.                                                                                                                                                                                                | Expired yesterday → not listed                          | Cases 10, 11, 16                                       |
| BR-REC-18  | "Flag for assessment" puts a member + type in Overdue regardless of date; it clears when that assessment is saved. "Snooze" hides a row until a chosen date, at most 90 days ahead.                                                                                                              | Snooze 30 days → hidden, returns after                  | Cases 12, 13, 15; E33 91 days → 400`SNOOZE_TOO_FAR` |
| BR-REC-93  | "Today" is the calendar date in the gym's time zone; due maths uses dates only, no clock times.                                                                                                                                                                                                  | 23:30 IST on 3 Oct → today is 3 Oct                     | `computeDue` takes `today` as an argument          |
| BR-REC-94  | Months add calendar months and land on the month's last day when needed; weeks add 7 days each.                                                                                                                                                                                                  | 31 Jan + 1 month → 28 Feb                               | Case 5, 6                                              |
| BR-REC-95  | Only assessments and measurements that are turned on are ever due.                                                                                                                                                                                                                               | Turned-off "Body age" → never a chip                    | Case 14                                                |
| BR-REC-96  | A row holds the member's measurements of one assessment whose due date is on or before today + "Due soon" days; its date is the earliest of them; before today = Overdue, otherwise Due soon ("Due today", "Due tomorrow", "Due in 3 days", Q3).                                                 | Due today → in Due soon as "Due today"                  | Case 7                                                 |
| BR-REC-97  | Order: "Assess soon" rows first (Q1), then most days overdue, then soonest due, then name A–Z.                                                                                                                                                                                                  | Flagged row above a 90-day overdue row                   | E31 order test                                         |
| BR-REC-98  | An "Assess soon" row shows every turned-on measurement of that assessment as chips; it ends when an assessment of that type is saved with a date on or after the day it was set (back-filling an older date does not end it).                                                                    | Set 1 Oct, back-fill dated 15 Sep → still "Assess soon" | Case 15                                                |
| BR-REC-99  | "Remind me later" offers 1 week, 2 weeks, 1 month or a date (after today, at most 90 days ahead, Q2); the row is hidden everywhere until that date; saving that assessment ends the reminder.                                                                                                    | Remind 1 month on 3 Oct → back on 3 Nov                 | Case 13                                                |
| BR-REC-100 | "Assess soon" and "Remind me later" replace each other, and either can be cleared from the row menu or the member page.                                                                                                                                                                          | Snoozed row → Assess soon → reminder gone, row on top  | E33/E34 test                                           |
| BR-REC-101 | Home shows, in order: Overdue, Due soon, Memberships ending, Recently ended (BR-REC-53); each shows its count and the first 5 rows with "See all"; an empty section shows one line, e.g. "Nobody is overdue."                                                                                    | 0 overdue → "Nobody is overdue."                        | UI test                                                |
| BR-REC-102 | Tapping a row opens Record assessment for that member and assessment (BR-REC-73); its "⋯" offers Assess soon, Remind me later, Open member.                                                                                                                                                     | Tap Surya's row → entry form                            | 2-tap check (BR-REC-140)                               |
| BR-REC-103 | The member page lists each turned-on assessment with one status: "Overdue 34 days", "Due in 5 days", "Next due 12 Dec", "Never recorded", "Assess soon" or "Reminder on 20 Oct".                                                                                                                 | Fran-only fitness test → "Next due 10 Nov"              | E32 test                                               |
| BR-REC-104 | "See all" lists are 25 per page with an assessment filter and the same order.                                                                                                                                                                                                                    | Filter Fitness test → only fitness rows                 | E31`typeId` test                                     |
| BR-REC-105 | Days overdue counts calendar days.                                                                                                                                                                                                                                                               | Due 1 Oct, today 3 Oct → "2 days overdue"               | Case 2                                                 |

## Due examples (`computeDue`; today 2026-10-03, Due soon 7 days, Body composition 1 month, Fitness test 2 months, Fran own 3 months, joined 2026-06-01)

| #  | Given                                                    | Then                                                         |
| -- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 1  | Weight last 2026-09-10                                   | due 10 Oct → Due soon, "Due in 7 days"                      |
| 2  | Weight last 2026-08-31                                   | due 30 Sep → Overdue, 3 days                                |
| 3  | Fran last 2026-08-10                                     | due 10 Nov → not listed                                     |
| 4  | Pull-ups never recorded                                  | due 1 Jun (join date) → Overdue, 124 days                   |
| 5  | Weight last 2026-01-31                                   | due 28 Feb                                                   |
| 6  | 2-week item last 2026-09-20                              | due 4 Oct → Due soon, "Due tomorrow"                        |
| 7  | Weight last 2026-09-03                                   | due 3 Oct → Due soon, "Due today"                           |
| 8  | Weight due 30 Sep, Body fat due 8 Oct, other items later | one row: Overdue 3 days, chips Weight, Body fat              |
| 9  | 5 body composition items due, 3 saved today              | row stays with 2 chips                                       |
| 10 | Membership ended 2 Oct                                   | no rows                                                      |
| 11 | Membership ends 8 Oct (Ends soon)                        | rows shown                                                   |
| 12 | Fitness test "Assess soon", nothing due                  | first row, label "Assess soon", chips = all 14 fitness items |
| 13 | Body composition reminder until 20 Oct                   | hidden until 20 Oct, then back                               |
| 14 | "Body age" turned off, never recorded                    | never a chip                                                 |
| 15 | Assess soon set 1 Oct, fitness test saved dated 15 Sep   | still "Assess soon"                                          |
| 16 | Archived member                                          | no rows                                                      |

## Screens

S2 Home (`/admin`). Desktop: two columns, due sections left, membership sections right, 1080 px.

```
+--------------------------------+
| Fionis CrossFit                |
| [ Search members...          ] |
| Overdue  12          See all > |
| Surya Pratap        34 days ...|
| Body composition               |
| [Weight][Body fat][+3]         |
| Anita Rao       Assess soon ...|
| Fitness test [Push-ups][+13]   |
| Due soon  5          See all > |
| Ravi K        Due in 3 days ...|
| Memberships ending 3 See all > |  <- members block
| Recently ended 2     See all > |  <- members block
| Home   Members  Reports Settings|
+--------------------------------+
```

S3 Due list (`/admin/due?tab=overdue|soon&type=`): tabs Overdue · Due soon, assessment filter chips, same
rows, 25 per page, "Show more". Row sheet: Record assessment · Assess soon · Remind me later › · Open member.

## Not now

WhatsApp/SMS reminders to members, per-member intervals, a calendar view, sending lists by email.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | "Assess soon" rows are shown… | **A** at the top / B mixed in by date | **A** → BR-REC-97 |
| Q2 | "Remind me later" choices | **A** 1 week, 2 weeks, 1 month or pick a date / B pick a date only | **A** → BR-REC-99 |
| Q3 | Someone due today is listed under… | **A** Due soon, "Due today" (matches v1) / B Overdue | **A** → BR-REC-96 |

## Changelog

- 2026-10-03 v0 — draft, split out of member-records v2; carries BR-REC-15…18 from v1 unchanged
- 2026-10-03 v0 — answers folded: all as recommended; archived members stay off Home and due lists even though
  they are editable (BR-REC-17); their member page still shows each assessment's status
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
