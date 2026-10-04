---
module: member-records/progress
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 2
frozen_on: 2026-10-03
owner: Arun
depends_on: [member-records/setup, member-records/members, member-records/assessments, member-records/data-model, member-records/api-contract, member-records/ux, member-records/performance]
---
# Member records · Progress (report card, gym progress, CSV export)

## Summary

Three outputs: a one-page report card per member to print or show on the phone, a gym-wide progress screen
for the owner, and CSV files of everything. Numbers follow each measurement's "better" direction. Done = the
report card of a seeded member fits one A4 page and every number matches a hand calculation from the paper.

## Owns

Rules BR-REC-22…24, 106…119 · endpoints E35–E39 · no tables (reads only) · pure functions `reportCard`,
`progressStats` · screens S12 Report card, S13 Gym progress (Reports tab), S18 Settings → Export data.

## Who can do what

| Action              | Allowed          |
| ------------------- | ---------------- |
| view, print, export | the shared login |

## Flow

None: this part only reads.

## Rules

| ID         | Rule                                                                                                                                                                                                                                                                                                                                                                                            | Example (given → then)                                         | Check                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| BR-REC-22  | Report card (one printable page): header (name, age, plan, join date) and, per metric, first / latest / best / change with a trend chart. "Best" follows the better-direction. Body composition adds the latest segmental table. Under 2 points shows the value only.                                                                                                                           | Fran 5:20 → 4:10 → best 4:10, change −1:10                   | `reportCard` table test                     |
| BR-REC-23  | Gym-wide progress: average change since each member's first reading of a metric, filterable by join month, plan, sex and age band; counts of improved / plateaued (< 1% change) / regressed; latest-value leaderboard per metric split by sex; active members by plan. Only members with 2+ readings count, and n is shown.                                                                     | Fat % filter "joined Jan 2026" → avg −2.1 pts, n = 12         | `progressStats` table test; E36             |
| BR-REC-24  | Everything is exportable to CSV (members, memberships, measurements) with one row per value.                                                                                                                                                                                                                                                                                                    | Export → one row per metric per date                           | E39 row-count test                            |
| BR-REC-106 | The card header shows gym name, member name, age, sex, plan and status, join date and printed date; then one section per assessment in setup order; each measurement shows first and latest (with dates), best, change since first (sign, unit, "better"/"worse") and a small trend line of the last 12 readings; never-recorded measurements are left out, turned-off ones with readings stay. | Surya: 15 body composition + 14 fitness rows                    | E35 test                                      |
| BR-REC-107 | Best is the highest or lowest value by direction; on a tie the earliest date wins; "No direction" shows no best.                                                                                                                                                                                                                                                                                | Deadlift 100 (Jan), 100 (Mar) → best 100, Jan                  | `reportCard` test                           |
| BR-REC-108 | The segmental table uses the latest body composition assessment that has any table value: rows Whole body, Arms, Trunk, Legs; one column per group; empty cells "–"; its date shown (≈ when estimated).                                                                                                                                                                                       | Arms missing on 12 Sep → "–" in that cell                     | E35 test                                      |
| BR-REC-109 | "Print" opens the browser's print for A4 portrait; navigation and buttons are hidden, everything reads in black and white, and up to 30 measurements fit on one page.                                                                                                                                                                                                                           | Seeded member (29 items) → print preview shows 1 page          | Manual print check (Chrome Android + desktop) |
| BR-REC-110 | Gym progress and leaderboards always include the latest saves: they are computed from the database on every request (no server cache, v2) and the screens fetch them again on every open.                                                                                                                                                                                                      | Save Surya's body fat → progress n goes 12 → 13 at once       | Freshness test (write, then read)             |
| BR-REC-111 | Gym progress: pick a measurement (default Body fat), filter by join month from–to, plan, sex, age band; it shows n, the average change since first reading in the unit, and Improved / No change / Worse counts; filters stay in the web address so a view can be bookmarked.                                                                                                                  | Body fat, joined Jan–Mar 2026, Female → avg −1.8 %, n = 7    | E36 + URL test                                |
| BR-REC-112 | Per member, change = latest − first reading; Improved/Worse follow the direction; "No change" when the change is under 1% of the first reading (both 0 → No change); "No direction" shows only the average change.                                                                                                                                                                            | First 30.0 → latest 29.8 (−0.67%) → No change                | `progressStats` test                        |
| BR-REC-113 | Gym progress counts non-archived members (Q1) with 2+ readings of the measurement, ended memberships included, and says how many were left out: "n = 12 · 5 with one reading not counted".                                                                                                                                                                                                     | Member with one reading → only in "not counted"                | E36`notCounted`                             |
| BR-REC-114 | Age bands are 10 years wide from 20: Under 20, 20–29, 30–39, 40–49, 50–59, 60+, by age today (Q2). | Born 1996-11-01 → 29 on 3 Oct 2026 → 20–29; born 2007-01-15 → 19 → Under 20 | Band test at 19/20, 29/30, 59/60; E36 `ageBand` values `under20`…`60plus` |
| BR-REC-115 | The leaderboard ranks each member's latest value of one measurement, Male and Female tabs, best first by direction, top 10 with "Show more" (Q3); equal values share a rank (1, 2, 2, 4); none for "No direction"; archived members left out.                                                                                                                                                   | Two at 4:10 Fran → both rank 2                                 | E37 test;`NO_DIRECTION` → 400              |
| BR-REC-116 | "Active members by plan" counts members whose membership is Active or Ends soon, by the plan of their latest period, plus a total.                                                                                                                                                                                                                                                              | 40 Monthly, 22 Quarterly, 9 Half-annual, 31 Annual → total 102 | E38 test                                      |
| BR-REC-117 | CSV files are UTF-8 with BOM (opens in Excel), comma-separated, dates YYYY-MM-DD; measurements have one row per value: member id, name, assessment, measurement, unit, date, estimated, value (seconds for times) and display ("2:02"); archived members are included with an "archived" column.                                                                                                | Plank 122 s → value 122, display 2:02                          | Golden CSV test                               |
| BR-REC-118 | Any CSV cell starting with =, +, −, @ or a tab gets a leading ' so a spreadsheet never runs it as a formula.                                                                                                                                                                                                                                                                                   | Notes "=HYPERLINK(…)" → "'=HYPERLINK(…)"                     | CSV test                                      |
| BR-REC-119 | Files are named like`measurements-2026-10-03.csv`, start downloading within 1 second and stream, so the app stays usable.                                                                                                                                                                                                                                                                     | 300,000 values → download starts at once                       | Perf-seed timing                              |

## Screens

S12 Report card (`/admin/members/[memberId]/report`). Phone: one card per measurement; print and desktop: a table.

```
+--------------------------------+   Print / desktop (A4 portrait):
| <  Report card        [Print]  |   Fionis CrossFit                  Printed 3 Oct 2026
| Surya Pratap · 44 · Male       |   Surya Pratap · 44 · Male · Annual (Active) · Joined 1 Jun 2025
| Annual (Active) · Joined 1 Jun |   BODY COMPOSITION  First   Latest  Best   Change        Trend
| BODY COMPOSITION               |   Weight kg         98.0    94.0    94.0   v 4.0 better  \_
| Weight          94.0 kg  3 Oct |   Height cm         172.0   172.5   -      +0.5
| first 98.0 · best 94.0         |   Segmental 12 Sep  Whole   Arms    Trunk  Legs
| v 4.0 kg better      \__/\_    |   Subcut. fat %     24.0    30.1    22.0   26.3
| Pull-ups        3 (1 reading)  |   FITNESS TEST
| ...                            |   Fran              5:20    4:10    4:10   v 1:10 better /\_
+--------------------------------+
```

S13 Gym progress (`/admin/reports?metric=&joinedFrom=&joinedTo=&plan=&sex=&age=`). Desktop: filters in one
row, results and leaderboard side by side, 1080 px.

```
+--------------------------------+
| Reports                        |
| Measurement [ Body fat %    v ]|
| Joined [Jan 2026]-[Mar 2026]   |
| (Any plan)(Any sex)(Any age)   |
| Average change   -2.1 %        |
| n = 12 · 5 not counted         |
| Improved 8 · No change 3 · Worse 1
| [========8=======][==3==][1]   |
| Leaderboard   (Male)(Female)   |
| 1  Surya Pratap   18.2  12 Sep |
| 2  Ravi K         19.0  10 Sep |
| Active members by plan         |
| Monthly 40 · Quarterly 22 ...  |
| Home   Members  Reports Settings|
+--------------------------------+
```

S18 Export data (`/admin/settings/export`): three rows — Members, Memberships, Measurements — each with
[Download CSV] and the line "Opens in Excel or Google Sheets".

## Build clarifications (v2, 2026-10-04, Stream F; owner to confirm at merge)

| # | Rule | Decision |
|---|---|---|
| P1 | 110 | No server cache (user decision): E36–E38 read the database on every request; the admin queries use `staleTime: 0`. BR-REC-147 "50 ms cached" and performance tactic 19 dropped. |
| P2 | 22, 106, 107 | A reading = one stored value with its assessment's date and "estimated" flag. First = earliest date, latest = most recent. `change` = latest − first, rounded to 3 decimals (storage precision), null under 2 readings. `points` = the last 12 readings, oldest first. Types and measurements appear in setup order; a turned-off assessment or measurement with readings stays; one with no readings for this member is left out. |
| P3 | 108 | Segmental table: the member's latest assessment (by date, then setup order) with ≥ 1 value of a measurement that has a report-table group. Columns = the groups of that assessment's measurements that are on or have a value there, in setup order (each with the unit and decimals of its first measurement); rows = Whole body, Arms, Trunk, Legs, always all four; a missing value is null ("–"). Rows are body parts as BR-REC-108 says (the S12 sketch is drawn the other way round). |
| P4 | 23, 111, 113, 114 | E36 population: non-archived members matching every given filter — join month between `joinedFrom` and `joinedTo` (inclusive, each optional; from after to → nobody), plan of the latest membership period (as BR-REC-116), sex, age band by age on the gym's today. `n` = those with 2+ readings of the measurement, `notCounted` = those with exactly 1, members with none are ignored. `avgChange` = mean of (latest − first), rounded to 3 decimals, null when n = 0. A turned-off measurement still answers. |
| P5 | 112 | No change when \|latest − first\| < 1% of \|first\|; first 0 and latest 0 → No change; first 0 and latest ≠ 0 → Improved or Worse by direction. "No direction": the three counts are 0. |
| P6 | 115 | E37: non-archived members of the given sex with ≥ 1 reading, ranked by their latest value (ended memberships included). Rank = 1 + the number of members with a strictly better value; same value → same rank, ordered earlier date first, then name, then id. Paged with the standard `page`/`pageSize` (default 10 = "top 10"; "Show more" asks for the next page; ranks continue across pages). 404 unknown measurement is checked before 400 `NO_DIRECTION`. |
| P7 | 116 | E38 counts non-archived members only (as Q1); a latest period that has not started yet counts as Active (as `membershipStatus`). |
| P8 | 24, 117 | CSV header row and columns (snake_case, in this order). `members.csv`: member_id, name, phone, email, date_of_birth, sex, joined_on, objective, notes, plan, membership_status, membership_end_on, archived — one row per member. `memberships.csv`: member_id, name, plan, start_on, end_on, archived — one row per period. `measurements.csv`: member_id, name, assessment, measurement, unit, date, estimated, value, display, archived — one row per stored value. Rows ordered by name (case-insensitive), member id, then date (measurements also by setup order). Plan, sex and status are written as their codes (`half_annual`, `expiring`); yes/no for `estimated` and `archived`; empty cell for a missing value; `value` is the stored number as plain decimal (seconds for times); `display` = `m:ss` for times, the number with the measurement's decimals otherwise (no unit). Lines end CRLF; a cell with a comma, quote, CR or LF is wrapped in quotes with inner quotes doubled. |
| P9 | 118 | The guard runs on every cell before quoting, numbers included: a cell starting with `=`, `+`, `-`, `@` or a tab gets a leading `'` (so a phone `+91…` and a negative value export as text). |
| P10 | 119 | E39 sends `Content-Disposition: attachment; filename="<file>-<gym today>.csv"` and the CSV headers before reading the rows, then streams rows in batches. S18 first makes sure the sign-in is fresh (one E05 call), then starts a plain browser download. |
| P11 | 111 | S13 URL keys: `metric`, `joinedFrom`, `joinedTo` (YYYY-MM), `plan`, `sex`, `age` (an age-band code); unknown values are ignored. Default measurement: the first measurement that is on whose name starts with "Body fat" (any case), else the first one that is on. The measurement list shows measurements that are on. |

| P12 | 108 | Two assessments with table values on the same date: the one earlier in setup order wins. |
| P13 | 117 | CSV `display` for a time of 1 h or more follows `formatDuration`: 3930 s → "1:05:30"; under 1 h → "m:ss" ("2:02"). |
| P14 | 118 | The guard characters are ASCII: `=`, `+`, `-` (hyphen-minus), `@`, tab. The "−" in the BR-REC-118 text is typography, not U+2212. |

## Not now

Server-made PDF, a date range on the report card, sending cards by WhatsApp/email, charts beyond trend lines
and bars, comparing two members, CSV import.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Archived members in gym progress and leaderboards | **A** left out (matches "vanish") / B included | **A**; still true now archived members are editable: their new values count once restored |
| Q2 | Age bands | **A** Under 30, 30–39, 40–49, 50+ / B 10-year bands from 20 | **B** → BR-REC-114 |
| Q3 | Leaderboard length | **A** top 10 with "Show more" / B top 10 only / C top 3 | **A** |
| Q4 | Report card covers | **A** all time / B the last 12 months | **A** |

## Changelog

- 2026-10-03 v0 — draft, split out of member-records v2 (file named `progress` because "report" names are reserved for run reports); carries BR-REC-22…24 from v1 unchanged
- 2026-10-03 v0 — answers folded: age bands Under 20 … 60+ (BR-REC-114, E36); archived members still left out
  of progress and leaderboards, report card and CSV still include them
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-04 v2 — changed after freeze (user decision during the Stream F build): BR-REC-110 has no server cache
  (computed live, admin refetches on open); performance BR-REC-147 drops "50 ms cached", tactic 19 dropped.
  Clarified during build (no other rule changed): P2–P14 (P12–P14 answer the test-writer's questions); E35 adds `id` + `decimals` per measurement, type `id`,
  and segmental groups as `{ name, unit, decimals }` (BR-REC-162, own types file).
