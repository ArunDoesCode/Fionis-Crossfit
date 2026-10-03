---
module: member-records/assessments
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-10-03
owner: Arun
depends_on: [member-records/setup, member-records/members, member-records/data-model, member-records/api-contract, member-records/ux, member-records/performance]
---
# Member records · Recording assessments

## Summary

A trainer records a member's results on the gym floor, phone in one hand: pick the member, pick the
assessment, type numbers, Save. Each field shows last time's value and the change. Old paper columns are
back-filled with estimated dates. Done = a 15-item body composition is entered in under 2 minutes and the
whole binder can be typed in without losing a value to a bad connection.

## Owns

Rules BR-REC-12, 19, 20, 21, 73…92 · endpoints E25–E30 · tables `assessments`, `measurements` · screens S10
Record assessment (+ choose-assessment and check-values sheets), S11 All assessments, the "Recent" block on
the member page · the device-side draft store and plausibility check (frontend only).

## Who can do what

| Action                          | Allowed          |
| ------------------------------- | ---------------- |
| record, edit, move date, delete (archived members too, members BR-REC-58) | the shared login |

## Flow

| Thing                             | States                                   | Rule              |
| --------------------------------- | ---------------------------------------- | ----------------- |
| Assessment (member + type + date) | — → Saved (editable) → Deleted        | BR-REC-19, 88, 92 |
| Form on this device               | Empty → Draft (kept on device) → Saved | BR-REC-85         |

## Rules

| ID        | Rule                                                                                                                                                                                                                                                                                                                | Example (given → then)                                         | Check                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| BR-REC-12 | Duration values are typed as mm:ss, stored in seconds and shown as mm:ss. Weights are stored in kg only.                                                                                                                                                                                                            | Plank "2:02" → 122 s                                           | `parseDuration` / `formatDuration` table test (golden fixture) |
| BR-REC-19 | An assessment = member + type + date, not in the future (earlier than the join date shows a warning). One per member + type + date: saving again edits it. Partial entry is allowed; blank fields are simply not recorded. The date can be marked "estimated" for undated paper columns. Delete needs confirmation. | Save body comp twice on 2025-12-30 → one record                | E26 twice → one row,`created=false`                             |
| BR-REC-20 | The entry form shows the previous value and the change next to each field, in the configured unit.                                                                                                                                                                                                                  | Weight field shows "prev 95.5 kg"                               | E25`previous` + UI                                               |
| BR-REC-21 | A value that jumps more than 30% from the previous one, or falls outside the metric's min/max, shows "please confirm" but can still be saved.                                                                                                                                                                       | Visceral fat 8 → 17.5 → warning, saved                        | Frontend`checkPlausibility` table test                           |
| BR-REC-73 | "Record assessment" on the member page opens a sheet to pick the assessment (with its due status); a Home row opens the form with the assessment already picked; the date starts as today; fields follow setup order and due ones carry a "due" tag.                                                                | Home row "Surya · Body composition" → form ready, 1 tap       | UI test; 2 taps from Home (BR-REC-140)                             |
| BR-REC-74 | Picking a date that already has this assessment opens it for editing ("Edit · 12 Mar 2025"); if values were already typed it asks "Open the saved one?" [Open] [Keep mine].                                                                                                                                        | 12 Mar exists → saved values appear                            | E25`existing` used                                               |
| BR-REC-75 | Time fields are two boxes, minutes and seconds, with the number keypad; seconds 0–59, minutes 0–599; pasting "2:02" fills both; 60 minutes or more shows as h:mm:ss (Q3).                                                                                                                                         | min 2, sec 75 → "Seconds must be 0 to 59"                      | Field unit test                                                    |
| BR-REC-76 | Number fields accept "." or ","; the value is rounded to the measurement's decimals (BR-REC-64); anything else shows "Enter a number like 95.5".                                                                                                                                                                    | "95,5" → 95.5                                                  | Parser test                                                        |
| BR-REC-77 | Only filled fields are saved; when editing, emptying a saved field removes that value, and the field says "will be removed" until Save.                                                                                                                                                                             | Clear Plank on 12 Mar → Plank gone from that date              | E26`value: null` → `removed: 1`                               |
| BR-REC-78 | Saving with nothing filled is refused ("Enter at least one value"); to remove a whole assessment use Delete.                                                                                                                                                                                                        | Empty form → Save → message                                   | 400`NO_VALUES`                                                   |
| BR-REC-79 | Paper-column chips Q1–Q4 set the date to join date + 0 / 3 / 6 / 9 months and tick "estimated" (v1 Q2; this spec's Q1).                                                                                                                                                                                            | Joined 1 Jun 2025, chip Q3 → ≈ 1 Dec 2025, estimated          | UI test                                                            |
| BR-REC-80 | Estimated dates show as "≈ Dec 2025" in forms, lists and the report card, and as`estimated = yes` in CSV.                                                                                                                                                                                                        | Q2 entry → history shows "≈ Sep 2025"                         | Format test                                                        |
| BR-REC-81 | "Previous" is the latest value of that measurement dated before this assessment's date; change = this − previous with sign and unit, plus an arrow and "better"/"worse" by the measurement's direction (none → no word); times as ±m:ss.                                                                         | Back-filling 2025-12-30 compares with 2025-09-30, not with 2026 | E25 test with later data present                                   |
| BR-REC-82 | The "please check" warning (BR-REC-21) uses jump =\|new − previous\| ÷ \|previous\| over 30% (skipped if no previous or previous is 0); it appears when the field is left; Save then shows one "Check these values" sheet [Go back] [Save anyway]; the server never blocks.                                       | Two odd values → one sheet listing both                        | UI test; API accepts the values                                    |
| BR-REC-83 | A future date cannot be picked or saved; a date before the join date shows "This is before Surya joined (1 Jun 2025)" and can be saved.                                                                                                                                                                             | Date tomorrow → 400`DATE_IN_FUTURE`                          | API + UI test                                                      |
| BR-REC-84 | After Save: "Saved 9 results for Surya", then back to where the entry started (Home or member page, Q2); "Save & next date" keeps member and assessment and clears date and values for back-filling.                                                                                                                | Binder entry: 4 dates in a row without leaving the form         | UI test                                                            |
| BR-REC-85 | Unsaved values are kept on this device per member + assessment + date (values only, never tokens) and offered back: "Restore unsaved results from 10:42?" [Restore] [Discard]; cleared on Save or Discard, dropped after 7 days (Q5).                                                                               | Phone locks mid-entry → reopen → Restore                      | Browser storage test                                               |
| BR-REC-86 | If Save fails (no connection, timeout, server error) the form stays filled with "Not saved — check the connection and tap Save again"; saving twice never makes two assessments.                                                                                                                                   | Wi-fi drops at Save → values still there → Save → one record | E26 replay test                                                    |
| BR-REC-87 | Moving a saved assessment to a date that already has the same assessment is refused: "There's already a Body composition on 15 Mar 2025 — open it instead".                                                                                                                                                        | Move 12 → 15 Mar (taken) → refused                            | 409`ASSESSMENT_DATE_TAKEN`                                       |
| BR-REC-88 | Delete asks "Delete Body composition from 12 Mar 2025? 9 results will be removed."; due dates update at once.                                                                                                                                                                                                       | Delete latest → Home shows it due again                        | E30 + due test                                                     |
| BR-REC-89 | "All assessments" lists a member's assessments newest first (date, assessment, number of results, ≈ when estimated), 25 per page, with an assessment filter; tapping one shows it with Edit and Delete.                                                                                                            | Filter "Fitness test" → only fitness rows                      | E27 test                                                           |
| BR-REC-90 | Leaving a form with unsaved changes asks "Leave without saving? Your entries stay as a draft." [Stay] [Leave].                                                                                                                                                                                                      | Back button mid-entry → question                               | UI test                                                            |
| BR-REC-91 | Every field opens a number keypad; "Next" moves to the next field in order; the last field's key is "Done"; Save stays visible above the keyboard.                                                                                                                                                                  | Type 15 values without touching the screen between them         | `inputmode`, `enterkeyhint` check on a phone                   |
| BR-REC-92 | Saved assessments can be edited or deleted at any time (Q4); every change is in the change log with old and new values.                                                                                                                                                                                             | Fix a typo from last year → saved, logged                      | Audit test                                                         |

## Screens

S10 Record assessment (`/admin/members/[memberId]/assess?type=&date=`). Desktop: 720 px; each row is
label · input · previous · change on one line.

```
+--------------------------------+
| x  Body composition            |
|    Surya Pratap                |
| Date [ 3 Oct 2026 ] [ ] About  |
| Paper column (Q1)(Q2)(Q3)(Q4)  |
| Weight  due                 kg |
| [ 94.0     ]   prev 95.5       |
|                v 1.5 kg better |
| Visceral fat             level |
| [ 17.5     ]   prev 8          |
| ! Please check - last time 8   |
| Plank               min : sec  |
| [ 2 ] : [ 02 ]  prev 1:50      |
|                ^ 0:12 better   |
| ...                            |
| [Save & next date] [   Save   ]|  <- action bar
+--------------------------------+
```

Choose-assessment sheet: "Record for Surya" · Body composition — Overdue 34 days · Fitness test — Due in 5 days.
Check-values sheet: "Check these values" · Visceral fat 17.5 (last time 8) · [Go back] [Save anyway].
S11 All assessments (`/admin/members/[memberId]/assessments`):

```
+--------------------------------+
| <  Surya - All assessments     |
| (All)(Body composition)(Fitness)|
| 12 Sep 2026  Body composition 15|
| 10 Aug 2026  Fitness test     14|
| ~ Dec 2025   Body composition  9|
| [         Show more          ] |
+--------------------------------+
```

## Not now

Saving while offline and syncing later (only drafts are kept), photos of paper sheets, members entering their
own results, two trainers editing the same assessment at once (last save wins), InBody/scale import.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Paper columns Q1–Q4 get the dates… | **A** Q1 = join date, Q2 = +3 months, Q3 = +6, Q4 = +9 / B Q1 = join date + 3 months | **A** → BR-REC-79 |
| Q2 | After Save, go back to… | **A** where you started: Home or member page / B always the member page | **A** → BR-REC-84 |
| Q3 | Times (Fran, plank) are typed in… | **A** two boxes, minutes and seconds (phone keypads have no ":") / B one box "2:02" | **A** → BR-REC-75 |
| Q4 | Old assessments can be changed… | **A** any time, every change logged / B only within 30 days | **A** → BR-REC-92 |
| Q5 | Unsaved drafts on a phone are kept for… | **A** 7 days / B until restored or discarded | **A** → BR-REC-85 |

## Changelog

- 2026-10-03 v0 — draft, split out of member-records v2; carries BR-REC-12, 19, 20, 21 from v1 unchanged (BR-REC-75 decides how mm:ss is typed)
- 2026-10-03 v0 — answers folded: all as recommended; archived members can be recorded for (members Q6 = B)
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-03 v1 — clarified during build (Stream 0): BR-REC-12 `parseDuration` accepts only m:ss / h:mm:ss; a bare number ("95") is not a time → null; no rule changed
