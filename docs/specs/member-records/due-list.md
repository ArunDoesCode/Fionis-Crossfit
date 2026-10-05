---
module: member-records/due-list
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 3
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
| BR-REC-16  | (v10: sub-items shown as one line of text, not chips, ux BR-REC-225.) Home Overdue/Upcoming shows one row per member per type: type name, days overdue, chips of the due sub-items. Overdue = due date before today; Upcoming = within the lead window (Setup, default 7 days). Most overdue first. A type is done when every due metric has a value; blanks stay due. | 3 of 5 due items entered → row stays, 2 chips           | Cases 8, 9                                             |
| BR-REC-17  | Members who are archived or Expired are excluded from Overdue/Upcoming. Expiring members stay in.                                                                                                                                                                                                | Expired yesterday → not listed                          | Cases 10, 11, 16                                       |
| BR-REC-18  | "Flag for assessment" puts a member + type in Overdue regardless of date; it clears when that assessment is saved. "Snooze" hides a row until a chosen date, at most 90 days ahead.                                                                                                              | Snooze 30 days → hidden, returns after                  | Cases 12, 13, 15; E33 91 days → 400`SNOOZE_TOO_FAR` |
| BR-REC-93  | "Today" is the calendar date in the gym's time zone; due maths uses dates only, no clock times.                                                                                                                                                                                                  | 23:30 IST on 3 Oct → today is 3 Oct                     | `computeDue` takes `today` as an argument          |
| BR-REC-94  | Months add calendar months and land on the month's last day when needed; weeks add 7 days each.                                                                                                                                                                                                  | 31 Jan + 1 month → 28 Feb                               | Case 5, 6                                              |
| BR-REC-95  | Only assessments and measurements that are turned on are ever due.                                                                                                                                                                                                                               | Turned-off "Body age" → never a chip                    | Case 14                                                |
| BR-REC-96  | A row holds the member's measurements of one assessment whose due date is on or before today + "Due soon" days; its date is the earliest of them; before today = Overdue, otherwise Due soon ("Due today", "Due tomorrow", "Due in 3 days", Q3).                                                 | Due today → in Due soon as "Due today"                  | Case 7                                                 |
| BR-REC-97  | Order: "Assess soon" rows first (Q1), then most days overdue, then soonest due, then name A–Z.                                                                                                                                                                                                  | Flagged row above a 90-day overdue row                   | E31 order test                                         |
| BR-REC-98  | (v10: shown as text, not chips, ux BR-REC-225.) An "Assess soon" row shows every turned-on measurement of that assessment as chips; it ends when an assessment of that type is saved with a date on or after the day it was set (back-filling an older date does not end it).                                                                    | Set 1 Oct, back-fill dated 15 Sep → still "Assess soon" | Case 15                                                |
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

## Build clarifications (v2, Stream E coordinator, 2026-10-04 — C6 and C10 answered by the owner as Q4, Q5; the rest owner to confirm at merge; no change of intent)

| # | Rule | Clarification |
|---|---|---|
| C1 | 15, 95, 14 | Each measurement has its own due date: the member's latest `measured_on` of that measurement + its effective interval (the measurement's own repeat, else its assessment's; BR-REC-14); never recorded → `joined_on`. Only turned-on measurements of turned-on assessments count; an assessment with no turned-on measurement is never listed (E31, E32). |
| C2 | 16, 96 | A row = one member + one assessment, holding its measurements due on or before today + "Due soon" days (`upcomingLeadDays`, Setup; 0 = only "Due today"). `dueOn` = the earliest of them; `daysOverdue` = calendar days from `dueOn` to today (0 = due today, negative = not yet due). `dueOn` before today → `overdue`, otherwise `upcoming`. Chips = the row's due measurements in setup order. |
| C3 | 17 | Left out of E31: archived members and members whose latest membership has Ended (Expired, `membershipStatus`). A member with no membership at all is not "Ended" and is listed. E32 answers for every member, archived too. |
| C4 | 18, 97, 98 | An "Assess soon" row is only in `overdue` (never `upcoming`), whatever its dates; `flagged: true`; chips = every turned-on measurement of the assessment in setup order; `dueOn` = the earliest due date among them (`daysOverdue` may be ≤ 0). It replaces that member + assessment's normal row. |
| C5 | 97 | Order in both lists: Assess soon first, then `dueOn` ascending ("most days overdue", then "soonest due" — one key), then name A–Z ignoring case, then assessment setup order. |
| C6 | 98, 99 | (Q4) "Assess soon" and "Remind me later" both end when an assessment of that type for that member is saved or edited after it was set (`assessments.updated_at` ≥ the override's `created_at`) **and** is dated on or after the day it was set (`assessed_on` ≥ `set_on`). Back-filling an older date ends neither. Worked out when reading: the `due_overrides` row stays and the assessments stream's save code does not touch it. Setting either again replaces the row (new `set_on` = today, new `created_at`). **Stream D must write `assessments.updated_at` on every save and edit** (E26 new and existing, E29): a save that only writes `measurements` would never end an override (issue #24). |
| C7 | 18, 99 | A reminder hides the row in E31 while today < `until_on`; on `until_on` the row is back (Case 13; "Remind 1 month on 3 Oct → back on 3 Nov"). |
| C8 | 18, 99 | E33 `until` must be after today (else 400 `VALIDATION_ERROR`, `details.field` = `until`) and at most today + 90 days (else 400 `SNOOZE_TOO_FAR`); "today" is the gym day (BR-REC-93). "1 month" = same day next month (BR-REC-94); 1 week / 2 weeks = + 7 / 14 days. |
| C9 | 100, 158 | E33 / E34: 404 when the member or the assessment does not exist. Archived members and turned-off assessments are accepted (a turned-off one shows nothing until turned on again). E34 with nothing set → 200 `{}`. Every successful E33 / E34 writes one change-log row in the same transaction: actions `due_override.set` and `due_override.clear`. |
| C10 | 103 | (Q5) Member page: one line per turned-on assessment (with at least one turned-on measurement), setup order. Status, first that applies: "Assess soon" → "Reminder on 20 Oct" (while the reminder is on) → "Never recorded" (no value of any turned-on measurement of that assessment, even when overdue) → "Overdue 34 days" → "Due today" / "Due tomorrow" / "Due in 5 days" (inside the Due soon window) → "Next due 12 Dec". E32: `state` comes from dates only (ignores Assess soon and reminders); `nextDueOn` = the earliest due date of its measurements; `daysOverdue` = days from `nextDueOn` to today; `items` = the due measurements (as C2), every turned-on one when flagged, `[]` when `ok`; `flagged` / `snoozedUntil` only while active (C6, C7). |
| C11 | 101, 104 | Home asks E31 with `pageSize=5` for each of its two sections and shows `meta.total` as the count; "See all" opens S3 `/admin/due?tab=overdue` or `?tab=soon`; S3 loads 25 per page ("Show more" adds the next page); its filter chips list the turned-on assessments in setup order and set `typeId`. |
| C12 | 102, 100 | A row tap opens `/admin/members/[memberId]/assess?type=<typeId>` (S10, built by the assessments stream). Row "⋯" sheet: Record assessment · Assess soon (or a choice to remove it when set) · Remind me later › (1 week, 2 weeks, 1 month, Pick a date) · Open member. The member page offers the same Assess soon / Remind me later / remove choices per assessment. |
| C13 | 101, 70, 88 | Due data is always fresh: E31 / E32 queries use `staleTime: 0`, so setup or assessment changes show on the next visit. Assess soon, Remind me later and remove change the lists at once and undo with a toast if the call fails (performance tactic 8). |

## Not now

WhatsApp/SMS reminders to members, per-member intervals, a calendar view, sending lists by email.

No automated UI tests for the Home sections, S3, the row sheet or the member "Assessments" block (no DOM test library, #9); covered by the manual checklist.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | "Assess soon" rows are shown… | **A** at the top / B mixed in by date | **A** → BR-REC-97 |
| Q2 | "Remind me later" choices | **A** 1 week, 2 weeks, 1 month or pick a date / B pick a date only | **A** → BR-REC-99 |
| Q3 | Someone due today is listed under… | **A** Due soon, "Due today" (matches v1) / B Overdue | **A** → BR-REC-96 |

## Changelog
- 2026-10-05 v3 — ux v10 visual refresh (D-037) amends wording only; see ux BR-REC-219…235

- 2026-10-03 v0 — draft, split out of member-records v2; carries BR-REC-15…18 from v1 unchanged
- 2026-10-03 v0 — answers folded: all as recommended; archived members stay off Home and due lists even though
  they are editable (BR-REC-17); their member page still shows each assessment's status
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-04 v2 — clarified during build (Stream E; no change of intent): section "Build clarifications" C1–C13.
  Owner answers: Q4 → C6 (Assess soon and Remind me later end by the same rule: a save made after setting and dated on/after
  the day set; worked out when reading), Q5 → C10 ("Never recorded" wins over Overdue on the member page). Others: per-measurement
  due dates, row date and `daysOverdue`, who is left out, flagged row shape, one sort key, reminder end day, `until` checks, 404s and
  change-log actions, member-page line order, Home page size, row menu, freshness.
- 2026-10-04 v2 — review R-1 (Stream E): C6 now says Stream D must write `assessments.updated_at` on every save and edit
  (E26 new and existing, E29); filed as #24. No rule changed.
