---
module: member-records/assessments
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 4
frozen_on: 2026-10-05
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

Rules BR-REC-12, 19, 20, 21, 73…92, 216, 217 · endpoints E25–E30 · tables `assessments`, `measurements` · screens S10
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
| BR-REC-78 | Saving with nothing filled is refused ("Enter at least one value"); to remove a whole assessment use Delete. v3: the message is a top alert re-announced on every click with focus on the first field (ux BR-REC-190, #45). | Empty form → Save twice → alert read out twice, focus on the first field | 400`NO_VALUES`; save-flow unit test |
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
| BR-REC-216 | On desktop Record assessment is a grid (ux BR-REC-188, page up to 1280 px): first row Date, About, Paper column; then the measurements in setup order, 1/2/3/4 columns by width (cells ≥ 240 px); measurements with a report place sit in titled sub-grids per group ("Subcutaneous fat %", "Skeletal muscle %") with the parts in the order whole body, arms, trunk, legs; each cell = label + unit, input, "prev" and change line, message slot; the form is a real `<form>` so Enter saves; phones stay one column. | Body composition at 1440 × 900 → all 15 fields, Save visible, no scroll | Playwright screenshots 360 / 800 / 1280 / 1440; ≤ 1 screen of scroll at 1280 × 720 |
| BR-REC-217 | E25 `metrics` also return `tableGroup` and `tablePart` (null when the measurement has no report place), an additive contract change. | "Skeletal muscle % – Arms" → `{ tableGroup: "Skeletal muscle %", tablePart: "arms" }` | Contract test; `contract:check` |

## Screens

S10 Record assessment (`/admin/members/[memberId]/assess?type=&date=`). Desktop (v3): the grid of BR-REC-216; the
wireframe below is the phone layout. Date uses the shared DatePicker (ux BR-REC-192).

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

## Build clarifications (v2, Stream D coordinator, 2026-10-04 — owner to confirm at merge; no change of intent)

| # | Rule | Clarification |
|---|---|---|
| D1 | 19, 83 | E26 refuses a `date` later than gym "today" (time zone from `gym_settings`, read by this stream's repository itself, D-021) with 400 `DATE_IN_FUTURE`; there is no lower bound (before the join date saves). E25 only checks the date's shape: a future date just returns a form. |
| D2 | 19, 77, 78, 92 | E26 `values`: a measurement left out is not touched; `{ value: n }` sets it; `{ value: null }` removes the stored value (no-op when none is stored). A save that would leave the assessment with no stored value at all → 400 `NO_VALUES` and nothing is written: a new assessment with no non-null value, or an edit that removes every remaining value (remove a whole assessment with E30). An edit may send only the changed fields, or an empty list when only `isEstimated` changes. `saved` = non-null entries written; `removed` = stored values deleted by `null` entries; `created` = a new assessment row was made. The body's `isEstimated` always replaces the stored flag. The admin form sends only the fields the trainer changed when it edits a saved assessment, so an untouched value is never re-rounded (setup C9: changing decimals never rewrites stored values). |
| D3 | 12, 76, 164 | Limits on E26 values (else 400 `VALIDATION_ERROR`): a metric id at most once per body; Number: finite, absolute value ≤ 999,999,999.999; Time: 0 to 35,999 seconds (599:59). Each value is rounded with `roundMetricValue` before it is stored (Number to the measurement's decimals, Time to whole seconds); a Number whose rounded form would pass ±999,999,999.999 is refused with 400 `VALIDATION_ERROR` (never a database error). The Time limit applies to the value as sent (`35999.5` and `-0.4` are refused). |
| D4 | 11, 66, 77 | E25 lists the type's turned-on measurements in setup order (none while the assessment is off) plus any measurement, on or off, that holds a value in `existing`, so an old record stays editable. E25 and E26 work for a turned-off assessment (history stays editable); E26 accepts any measurement of the given type, on or off; one from another type → 400 `METRIC_NOT_IN_TYPE`. The choose sheet and Home offer only turned-on assessments. |
| D5 | 20, 81 | `previous` = the stored value of that measurement with the latest date strictly before the form's date, from any assessment of the member (later data never matters; archived members too); `previous.isEstimated` is its assessment's flag. |
| D6 | 19, 86 | Unknown member or assessment type → 404 `NOT_FOUND`; archived members work. Every E26 and E29 write takes `select … for update` on the member row first (as members, D-021), so two saves racing on one member + assessment + date end as one row (the second answers `created: false`). E26 takes no `Idempotency-Key`: a retry is the same upsert (BR-REC-156 lists E17 and E22 only). |
| D7 | 92, 158 | Every E26 (create or edit), E29 and E30 writes one change-log row in its transaction: entity `assessment` (id = the assessment), actions `assessment.save`, `assessment.move`, `assessment.delete`; before/after hold `date`, `isEstimated` and the values by measurement id (a create has no before; a delete has no after). |
| D8 | 87, 166 | E29 changes `date` and/or `isEstimated`; moving also moves every value's `measured_on` in the same transaction; the same date it already has is not "taken"; a future date → 400 `DATE_IN_FUTURE`; a date that already holds this assessment for the member → 409 `ASSESSMENT_DATE_TAKEN`. |
| D9 | 88, 165 | E30 deletes the assessment and its values (the only hard delete in the module, BR-REC-165); `removed` = how many values went. E28 returns every stored value (on or off measurements) in setup order. |
| D10 | 89, 155 | E27 sorts by date (`sortDir`, default `desc`) then id; a member with nothing, or an unknown id, gives an empty list (no 404, as the api-contract table); `valueCount` = stored values. |
| D11 | 73 | The status words in the choose sheet and the "due" tags on fields come from E32 (due-list stream). While E32 still answers 501 the sheet lists the turned-on assessments without a status and the fields carry no tag; no error is shown. `/assess` without `type` opens the choose sheet; `date` defaults to today. |
| D12 | 84 | "Back to where the entry started" = the history entry before the form; opened directly (nothing before it) → the member page. "Save & next date" keeps member and assessment, empties date and values (the date field takes focus), clears that date's draft. An edit that writes no value (only About changed) says "Saved." instead of the count. |
| D13 | 85 | Draft key = member + assessment + date, stored in the browser's `localStorage` as `assess-draft:v1:<memberId>:<typeId>:<date>` with the save moment; values only (the typed text of Number fields, seconds of Time fields) and the About flag. A draft with every value empty is not kept. Drafts older than 7 days are dropped whenever a form opens; restore is offered once on open. |
| D14 | 21, 82 | "Please check": the jump is strictly over 30% (exactly 30% is fine), or the value is below the measurement's min / above its max when those are set; both can apply. One line under the field; the "Check these values" sheet lists every flagged field. |
| D15 | 81 | Change line = arrow (▲ up, ▼ down, none when equal) + signed amount with unit ("−1.5 kg", "+0.5 %", Time as "+0:12" / "−1:05", h:mm:ss from one hour) + the word "better" or "worse" by the measurement's direction; no word for "No direction"; equal → "No change". The difference is rounded to the measurement's decimals. |
| D16 | 79 | Chips Q1–Q4 = join date + 0 / 3 / 6 / 9 calendar months (`addMonths`, month-end clamp) and tick "About". A date that lands in the future is flagged like any future date (BR-REC-83). |
| D17 | 75, 76, 91 | Shared fields get small fixes in this stream (user decision 2026-10-04): `DurationField` reports an out-of-range box (seconds above 59, minutes above 599) as invalid instead of empty and says "Enter seconds from 0 to 59" / "Enter minutes from 0 to 599" itself (#19); `NumberField` gets `allowNegative` (a ± button next to the decimal keypad, #21), used when the measurement has no lower check limit or one below 0 (Flexibility); both get `enterKeyHint` ("next", "done" on the last field). |
| D18 | 89 | The member page "Recent" block shows the latest 3 assessments (E27, `pageSize=3`) as rows "12 Sep 2026 · Body composition · 15 results" (≈ when estimated), empty → "No assessments yet."; a row opens that assessment on S11. S11 shows the tapped assessment in one sheet (values, Edit → S10 at that date, Delete as a confirm step inside the same sheet, no second sheet, #18); the assessment filter is kept in the URL (`?type=`). |
| D19 | 90 | The leave question appears (when anything differs from what was opened: a typed value, or on a saved assessment a changed value or About; moving to another date leaves the opened assessment, and what was typed stays in that date's draft) for the header close button, the browser Back button and, as the browser's own prompt, closing the tab; the draft stays in every case. |
| D20 | 160 | E25 sends no `ETag` (BR-REC-160 names E07 and E09 only); its example "re-open entry form → 304" is read as the catalog request the form makes. E25 `metrics` is one list in setup order (`sort_order`, then id) holding the turned-on measurements and the off ones that hold a value; an unknown `typeId` on E27 gives an empty list like an unknown `memberId`. |
| D21 | 87 | E29 (move a saved assessment to another date) is built as an API only: v1 has no screen that moves an assessment (S11's sheet offers Edit and Delete; Edit reopens S10 at that date). The BR-REC-87 sentence is therefore not shown anywhere yet; the move screen is a GitHub issue. |

## Not now

Saving while offline and syncing later (only drafts are kept), photos of paper sheets, members entering their
own results, two trainers editing the same assessment at once (last save wins), InBody/scale import.

No automated UI tests for the choose sheet (BR-REC-73), the leave guard (BR-REC-90), the offer and check sheets (BR-REC-20, 21), the phone keypad (BR-REC-75, 91) or draft restore (BR-REC-85) (no DOM test library, #9); covered by the manual checklist.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Paper columns Q1–Q4 get the dates… | **A** Q1 = join date, Q2 = +3 months, Q3 = +6, Q4 = +9 / B Q1 = join date + 3 months | **A** → BR-REC-79 |
| Q2 | After Save, go back to… | **A** where you started: Home or member page / B always the member page | **A** → BR-REC-84 |
| Q3 | Times (Fran, plank) are typed in… | **A** two boxes, minutes and seconds (phone keypads have no ":") / B one box "2:02" | **A** → BR-REC-75 |
| Q4 | Old assessments can be changed… | **A** any time, every change logged / B only within 30 days | **A** → BR-REC-92 |
| Q5 | Unsaved drafts on a phone are kept for… | **A** 7 days / B until restored or discarded | **A** → BR-REC-85 |

## Build clarifications (U4, 2026-10-05)

- **Layout helper (BR-REC-216):** `frontend/src/lib/assessments/layout.ts` exports `layoutMetrics(metrics)` returning an ordered list of blocks `{ title: string | null, metrics }`: metrics without a `tableGroup` form one untitled block in setup order; metrics sharing a `tableGroup` form one titled block (title = the group name) whose members are ordered whole body, arms, trunk, legs (the order of the `tablePart` enum values in `backend/src/lib/enums.ts`); blocks keep the position of their first metric in setup order. The Record assessment `<form>` uses `FormGrid` (`maxCols` 4) with `FormSection` for titled blocks; the first row is Date, About, Paper column.

## Changelog
- 2026-10-05 v4 — clarified during build (U4): `layoutMetrics` helper for the desktop grid; no rule changed
- 2026-10-05 v3 — re-frozen by the owner after the UX redesign review (#59); all open questions answered
- 2026-10-03 v0 — draft, split out of member-records v2; carries BR-REC-12, 19, 20, 21 from v1 unchanged (BR-REC-75 decides how mm:ss is typed)
- 2026-10-03 v0 — answers folded: all as recommended; archived members can be recorded for (members Q6 = B)
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-03 v1 — clarified during build (Stream 0): BR-REC-12 `parseDuration` accepts only m:ss / h:mm:ss; a bare number ("95") is not a time → null; no rule changed
- 2026-10-04 v2 — clarified during build (Stream D): D1–D21 (E25/E26 details, off measurements, change log, draft key, change-line text, shared field fixes #19/#21, Recent block); no rule changed
- 2026-10-04 v2 — review round 1 (Stream D): D2 amended (NO_VALUES = the save would leave no value at all; edits send only changed fields, so an untouched value is never re-rounded) and D21 (E29 API-only, move screen deferred); no rule changed
- 2026-10-04 v2 — D19 clarified (review R-5, R2-2): flipping About on a saved assessment counts as an unsaved change; a date move does not (the typed values go to that date's draft); no rule changed
- 2026-10-04 v2 — D12 clarified (review round 1): an About-only edit toasts "Saved."; no rule changed
- 2026-10-04 v2 — D2 clarified (review round 2, R2-3): Save on a saved assessment with nothing changed sends no request; no rule changed
- 2026-10-05 v3 — changed after freeze (owner UAT #59, #45, #46): new BR-REC-216 (desktop grid with titled segmental
  sub-grids, Enter saves) and BR-REC-217 (E25 `tableGroup`/`tablePart`); BR-REC-78 UI follows ux BR-REC-190; the form
  state model (D-024 reducer vs RHF + Zod) is ux Q3; S10 desktop 720 px line replaced
- 2026-10-05 v3 — owner answers: ux Q3 = A — the Record form moves to React Hook Form + Zod under the shared
  `FormItem` / `FloatingLabelInput` format (drafts from `watch`, leave guard from `isDirty`, D-034 supersedes D-024 (3));
  BR-REC-85, 90 behaviour unchanged; draft key (D13) unchanged; a saved assessment saved with no change closes
  silently (ux BR-REC-190, Q8 = B; replaces the "Saved." / no-request note of D2 only for the no-change case)
