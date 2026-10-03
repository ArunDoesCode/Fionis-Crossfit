---
module: member-records/members
parent: member-records
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-10-03
owner: Arun
depends_on: [member-records/data-model, member-records/api-contract, member-records/ux, member-records/performance]
---
# Member records · Members and memberships

## Summary

Add a member with their first membership, find them fast by name or phone, see their page, renew, archive
and restore. Membership status (Active, Ends soon, Ended) is worked out from dates, never typed. Done = the
paper binder's members are all in, search finds anyone in two letters, and Home lists whose membership ends soon.

## Owns

Rules BR-REC-03…09, 45…59, 172 · endpoints E16–E24 · tables `members`, `membership_periods` · screens S4
Memberships ending, S5 Members, S6 Add member, S7 Member page (header + membership block; the page frame
comes from Stream 0), S8 Edit member, S9 Renew/edit period sheet, the two membership sections on Home.

## Who can do what

| Action | Allowed |
|---|---|
| add, edit, search, renew, archive, restore (archived members can still be edited) | the shared login |

## Flow

| Thing | States (from dates, never typed) | Rule |
|---|---|---|
| Membership | Active → Expiring ("Ends soon") → Expired ("Ended") | BR-REC-08, 52 |
| Member | Active ↔ Archived (hidden from search and Home, still editable) | BR-REC-06, 58, 172 |

## Rules

| ID | Rule | Example (given → then) | Check |
|---|---|---|---|
| BR-REC-03 | A member needs full name, phone, date of birth, sex and join date. Email, objective (fat loss / strength / general fitness / other) and notes are optional. Age is always computed from date of birth. | DOB 1982-05-10 → age 44 on 2026-10-03 | API E17 without phone → 400; age in E18 from DOB |
| BR-REC-04 | Same name is allowed. Same phone as another member shows a duplicate warning but can be saved (families share phones). | Two "Surya Pratap", different phones → both saved | E17 with a known phone → 201 |
| BR-REC-05 | Creating a member also needs a first membership period (plan + start date). Past start dates are allowed for historical entry. | Joined 2025-06-01, annual → saved | E17 without `firstPeriod` → 400 |
| BR-REC-06 | Members are archived, never deleted. Archived members vanish from search and Home; history stays; they can be restored. | Archive → not in search; restore → back | E16 `q` excludes archived unless `status=archived`; E21 brings back |
| BR-REC-07 | Search needs 2+ characters and matches part of name, phone or email. Each result shows name, phone, last assessment date and membership status. | "sur" → both Suryas with phones | E16 `q=s` → 400; row fields present |
| BR-REC-08 | Plan = Monthly 1, Quarterly 3, Half-annual 6, Annual 12 calendar months. End = start + months − 1 day (clamped to month end). Status: Active; Expiring when end is within the expiry lead days (Setup, default 14); Expired when end has passed and no later period exists. Home lists Expiring and recently Expired. | Monthly from 15 Jan → ends 14 Feb | Pure-function table below |
| BR-REC-09 | Renewal adds a new period (default start = previous end + 1 day). A member's periods may not overlap. Periods can be edited, not deleted. | Overlap with previous → rejected | E22 overlap → 409 `PERIOD_OVERLAP`; no DELETE route |
| BR-REC-45 | Name is 2–80 characters (outer spaces trimmed, double spaces collapsed); email must look like an email; notes up to 1,000 characters. | " Surya  Pratap " → "Surya Pratap" | Zod test |
| BR-REC-46 | Phone: 10–15 digits after removing spaces, dashes and brackets (a leading + is allowed); two phones are "the same" when their last 10 digits match. | "+91 98450-12345" = "9845012345" | Normaliser table test |
| BR-REC-47 | The duplicate-phone warning shows under the phone field when the field is left, names the other member(s) (archived ones marked "archived") with an "Open" link, and never blocks saving. | Type Anita's phone → "Also used by Anita Rao · Open" | E16 `phone=…&status=any`; Save still enabled |
| BR-REC-48 | Date of birth and join date cannot be in the future (gym time zone); an age under 10 or over 100 shows "Please check the date" but can be saved. | DOB 2030-01-01 → 400 `DATE_IN_FUTURE`; DOB 1920 → warning, saved | API + form test |
| BR-REC-49 | Sex is Male or Female (Q3). | Sex "other" sent → 400 | Zod enum test |
| BR-REC-50 | The first membership has no default plan (the trainer picks one); its start defaults to the join date and may not be before it. | Joined 1 Jun, start 20 May → "Membership can't start before the join date" | 400 `START_BEFORE_JOIN` |
| BR-REC-51 | End date = the day before the same date N months later; if that date does not exist in that month, the last day of that month (table below). | Monthly from 31 Jan 2026 → 28 Feb 2026 | `membershipEnd()` table test, same cases on frontend (golden fixture) |
| BR-REC-52 | Status comes from the member's latest period (by start): Ended if its end is before today; Ends soon if it ends within the lead days (ending today counts); otherwise Active, including a period that has not started yet. | Renewed early (next period exists) → Active, not Ends soon | `membershipStatus()` table test; SQL filter uses the same cases |
| BR-REC-53 | Home shows "Memberships ending" (Ends soon, soonest first) and "Recently ended" (ended in the last 30 days, most recent first); archived members are never listed. | Ended 31 days ago → not in Recently ended | E24 tests |
| BR-REC-54 | Renew opens with the last plan and start = last end + 1 day, both changeable, and shows the new end date before saving. | Annual ended 31 May → Renew → "Ends 31 May 2027" | UI test; E22 with defaults |
| BR-REC-55 | Editing a period re-calculates its end and is refused if it would overlap another period or start before the join date. | Move start into previous period → refused | E23 → 409 / 400 |
| BR-REC-56 | Search ignores upper/lower case and spaces in phone numbers; names starting with the text come first, then the rest A–Z; 25 per page with "Show more". | "sur" → "Surya K", "Surya Pratap", then "Asura M" | E16 order test |
| BR-REC-57 | Members (no search text) lists non-archived members A–Z, 25 per page, with filter chips All · Active · Ends soon · Ended · Archived; Archived is the only list of archived members, and search text under it looks only at them. | Tap "Ended" → only ended members; tap "Archived", type "sur" → archived Suryas only | E16 `status` tests, `q` + `status=archived` |
| BR-REC-58 | Archive asks "Archive Surya? They'll be hidden from search and Home. You can restore them later."; an archived member stays fully editable (details, memberships, assessments), and saving a membership period that covers today (renew or edit) restores them automatically (Q7 = B); details, assessments and periods that do not cover today (old binder entries) never do, and the Restore button always works. | Archived Surya → fix phone, add an old assessment → still hidden; Renew from today → Surya is back in search and Home | E19, E22, E26 on an archived member succeed; E22/E23 with a period covering today clears `archivedAt` and returns `memberRestored: true`, otherwise not; E21 restores |
| BR-REC-59 | The member page shows name, age, sex, phone (tap to call), join date, membership (plan, status, days left, end date) and buttons Record assessment, Renew, Report card, All assessments, Edit. | Open Surya → "Annual · Active · 241 days left" | Screen checklist |
| BR-REC-172 | The page of an archived member, or of one whose membership has ended, starts with a banner saying when: "Archived 2 Jun 2026 · Membership ended 31 May 2026" (archived part only when archived; "ends" when still running), with Restore when archived. | Ended 31 May, not archived → "Membership ended 31 May 2026"; archived while running → "Archived 2 Jun 2026 · Membership ends 31 Dec 2026" [Restore] | UI test of the three cases from E18 `archivedAt` + `membership.endOn` |

## Membership maths (pure functions, shared with the frontend through a golden fixture)

| Plan, start | End (BR-REC-51) | | Today 2026-10-03, lead 14, latest period ends | Status (BR-REC-52) |
|---|---|---|---|---|
| Monthly, 15 Jan 2026 | 14 Feb 2026 | | 31 Dec 2026 | Active |
| Quarterly, 1 Mar 2026 | 31 May 2026 | | 10 Oct 2026 | Ends soon · "Ends in 7 days" |
| Half-annual, 10 Apr 2026 | 9 Oct 2026 | | 3 Oct 2026 | Ends soon · "Ends today" |
| Annual, 1 Jun 2025 | 31 May 2026 | | 2 Oct 2026 | Ended · "Ended yesterday" |
| Monthly, 31 Jan 2026 | 28 Feb 2026 (Q1) | | starts 20 Oct 2026 (future) | Active · "Starts 20 Oct" |
| Monthly, 28 Feb 2026 | 27 Mar 2026 | | — | — |
| Annual, 29 Feb 2028 | 28 Feb 2029 | | — | — |

## Screens

S5 Members (`/admin/members`). Desktop: same rows, 1080 px wide, phone and last assessment in columns. Under
the Archived chip the detail line reads "Archived 2 Jun · Ended 31 May".

```
+--------------------------------+
| Members                        |
| [ Search name, phone, email  ] |
| (All)(Active)(Ends soon)(Ended)|
| (Archived)                     |
| Surya Pratap            Active |
| 98450 12345 · Last 12 Sep      |
| Anita Rao       Ends in 4 days |
| 99000 11111 · Never assessed   |
| [        Show more           ] |
| [        + Add member        ] |  <- action bar
+--------------------------------+
```

S7 Member page (`/admin/members/[memberId]`). Desktop: two columns (left: person + membership, right: blocks).
Archived or ended: the BR-REC-172 banner sits under the title.

```
+--------------------------------+
| <  Surya Pratap         [Edit] |
| 44 y · Male · Joined 1 Jun 2025|
| 98450 12345 (call)             |
| Membership                     |
| Annual · Active · 241 days left|
| Ends 31 May 2026      [Renew]  |
| Assessments   <- due-list block|
| Recent        <- assessments block
| [All assessments][Report card] |
| [   Record assessment        ] |  <- action bar
+--------------------------------+
```

S6 Add member (`/admin/members/new`; S8 Edit is the same form without membership fields): Full name *, Phone *
(duplicate warning "! Also used by Anita Rao · Open" under it), Date of birth *, Sex * (Male)(Female), Joined
on * (today), Membership * (Monthly)(Quarterly)(Half-annual)(Annual), Starts on * (= joined), live "Ends 31 May
2026", then "More details": Email, Goal, Notes; action bar [Add member].
S9 Renew sheet: plan chips, "Starts on", live "Ends …" line, [Cancel] [Renew]; on an archived member it adds
"Renewing brings Surya back to the list." (shown when the new period covers today) S4 Memberships ending
(`/admin/memberships?tab=ending|ended`): rows "Anita Rao · Ends in 4 days · [Renew]", 25 per page.

## Not now

Custom plans and prices, payments, freezes/pauses, bonus days or manual end dates, member photos, merging duplicates, CSV import.

## Questions (all answered 2026-10-03)

| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | A monthly membership starting 31 Jan ends… | **A** 28 Feb (never shorter than the month) / B 27 Feb | **A** |
| Q2 | "Recently ended" on Home shows memberships that ended in the last… | **A** 30 days / B 14 days / C 60 days | **A** |
| Q3 | Sex options | **A** Male / Female (reports split by these) / B add "Other" | **A** |
| Q4 | Phone numbers | **A** Indian mobiles, compared on the last 10 digits / B other countries too | **A** |
| Q5 | Plan for a new member | **A** no default, trainer picks / B Monthly pre-selected | **A** |
| Q6 | An archived member is… | **A** read-only until restored / B still editable | **B**, and their page shows when the membership ended (owner) → BR-REC-58, 172 |
| Q7 | Renewing an archived member… | **A** keeps them archived; the sheet says how to restore (recommended: safe when typing in old binder members) / B restores them when the new membership covers today | **B** → BR-REC-58 |

## Changelog

- 2026-10-03 v0 — draft, split out of member-records v2; carries BR-REC-03…09 from v1 unchanged
- 2026-10-03 v0 — answers folded: archived members stay editable (BR-REC-58 rewritten, `MEMBER_ARCHIVED` gone),
  reached via the Archived chip (BR-REC-57); new BR-REC-172 ended/archived banner; new Q7; S6 wireframe as text
- 2026-10-03 v0 — Q7 = B: renewing (or editing a period of) an archived member restores them when the period covers today (BR-REC-58)
- 2026-10-03 v1 — frozen with the member-records index (v2); all questions answered, 0 open
- 2026-10-03 v1 — clarified during build (Stream 0): BR-REC-52 "within the lead days" is inclusive (14 days left, lead 14 → Ends soon); no rule changed
