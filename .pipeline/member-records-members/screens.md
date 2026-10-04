
## Round A (slices 1-3) — admin: add, find, edit, archive (frontend-dev, Stream B)

Permission for every screen below: the shared login (any signed-in visitor; the page guard sends everyone else to Login).
"Today" on every screen = the device's day (the gym and its phones share one zone); the server stays the judge (`DATE_IN_FUTURE`).

### S5 Members — `/admin/members`
- Header: title "Members"; main action **+ Add member** (right of the header from 1024 px; bar above the tabs on phones) → S6.
- **Search members** field (250 ms after the last key, clear button). Under 2 letters (after trimming) nothing is searched and the normal list shows (BR-REC-07). 2+ letters → `q`.
- Chips **All · Active · Ends soon · Ended · Archived** (one is always chosen, All at start). Search text and chip are in the URL (`?q=sur&status=archived`): Back from a member returns to the same list. Search under **Archived** finds only archived members.
- Rows (whole row opens `/admin/members/<id>`, 64 px, never a table): name; detail line `98450 12345 · Last 12 Sep` or `98450 12345 · Never assessed`; badge at the right (words + icon + colour): **Active**, **Ends in 4 days** / **Ends tomorrow** / **Ends today**, **Ended**, **Archived**.
  - Under the **Archived** chip the detail line reads `Archived 2 Jun · Ended 31 May` (`Ends 31 Dec` while the membership still runs) and the badge says **Archived**.
  - Order: A-Z; with search text, names starting with it first, then the rest A-Z (BR-REC-56, server side).
- 25 rows, then a full-width **Show more** button that adds the next 25 under the rows (button reads "Loading…" while it loads; gone when no more). A failed "Show more" shows "Couldn't load this." [Try again] under the rows.
- Empty: All, no search → "No members yet." + **Add member** (secondary button). Active → "No active members."; Ends soon → "No memberships end soon."; Ended → "No ended memberships."; Archived → "No archived members."; with search text → `No member matches "sur".` (`No archived member matches "sur".` under Archived).
- Loading: search field + chips + 8 grey rows (route `loading.tsx`, then grey rows while the first page loads). While the text or chip changes the old rows stay, dimmed, until the new ones arrive. Failed first load: "Couldn't load this." [Try again].
- Not built: desktop columns (phone and last assessment as columns) — rows are the phone rows on every width (see QUESTIONS in the report).

### Home search — `/admin` (slot `HomeSearch`)
- **Search members** field under the Home title. 2+ letters → the matching members appear as rows (same rows as S5, 25 + **Show more**) under the field, above the Home sections; tap a row → member page. Nothing is asked of the server under 2 letters.
- No match → `No member matches "xx".`. Loading: 3 grey rows. Error: "Couldn't load this." [Try again].
- Archived members are never found here (BR-REC-06).

### S6 Add member — `/admin/members/new`
- Header: back arrow to Members, title "Add member", main action **Add member** (bar on the bottom edge on phones, tab bar hidden because it is a form). Off only while saving ("Saving…" + spinner). No Reset button (BR-REC-134).
- Form is drawn only in the browser (grey form shapes first) because its defaults are the device's day.
- Fields, one column, label above, required marked *:
  1. **Full name** * — trimmed, double spaces collapsed; "Enter the full name" / "Use at least 2 letters" / "Use at most 80 characters".
  2. **Phone** * — spaces, dashes, brackets, leading + allowed, 10-15 digits; "Enter a phone number" / "Enter 10 to 15 digits, like 98450 12345". On leaving the field with a valid phone, other members with the same last 10 digits are named under it: `Also used by Anita Rao · Open` (archived ones `Chitra Rao (archived)`; several: `Also used by A · Open, B (archived) · Open`). **Open** opens that member in a new tab (what is typed here stays). Never blocks saving.
  3. **Date of birth** * — the phone's date picker, no future days; "Enter the date of birth" / "Enter a real date" / "That date is in the future. Pick today or an earlier day." An age under 10 or over 100 shows the warning "Please check the date" (amber, not red) and can still be saved.
  4. **Sex** * — chips **Male · Female**, nothing chosen at start; "Pick Male or Female".
  5. **Joined on** * — starts as today; no future days.
  6. **Membership** * — chips **Monthly · Quarterly · Half-annual · Annual**, NONE chosen at start (no default plan); "Pick a membership plan".
  7. **Starts on** * — starts as the join date and follows it until changed by hand; may be a past day (historical entry) or a future one, but never before the join date: "Membership can't start before the join date".
  8. Live line under it: `Ends 31 May 2026` (appears once a plan is chosen; follows plan and start date; always with the year).
  9. **More details** (closed block; opens on tap, or by itself when Save finds a problem inside): **Email** (shape check: "Enter an email like name@example.com"), **Goal** chips **Not set · Fat loss · Strength · General fitness · Other** ("Not set" lets a chosen goal be cleared), **Notes** (up to 1,000 characters: "Use at most 1,000 characters").
- Checked when a field is left and again on **Add member**; the button stays tappable with problems: the page scrolls to the first problem (top to bottom order above) and puts the cursor/focus there.
- Save: one request with an `Idempotency-Key`. Same details tapped again after a lost answer → same key (one member, not two); changed details → a new key. Success → toast "<Name> added." and the new member's page (`/admin/members/<id>`).
- Server refusals: `DATE_IN_FUTURE` under Date of birth or Joined on (by `details.field`); `START_BEFORE_JOIN` under Starts on ("Membership can't start before the join date. Pick a later start date."); `VALIDATION_ERROR` under the field it names; anything else (`RATE_LIMITED`, `INTERNAL_ERROR`, offline "Couldn't save. Check your connection and try again.") a toast. The button is tappable again after a refusal.

### S8 Edit member — `/admin/members/[memberId]/edit`
- Same form without Membership / Starts on / Ends line, filled from the member (Full name, Phone, Date of birth, Sex, Joined on, More details). More details starts open when the member has an email, goal or notes. Header: back arrow to the member page, title "Edit member", main action **Save**.
- Works for archived members; saving never changes whether they are archived (BR-REC-58).
- The Phone's duplicate warning never names the member being edited.
- Only changed fields are sent (E19). Nothing changed → no request, back to the member page. Success → toast "Saved." and the member page.
- Joined on moved after one of the member's membership starts → refused under Joined on: "A membership starts before this date. Pick an earlier join date." (`START_BEFORE_JOIN` on E19). `DATE_IN_FUTURE` under its field.
- Loading: grey form (route `loading.tsx`, then grey form while the member loads); failed load: "Couldn't load this." [Try again].

### S7 Member page slots — `/admin/members/[memberId]` (`MemberHeader`, `MembershipBlock`)
- **MemberHeader** (first block): banner (BR-REC-172) → name → `44 y · Male · Joined 1 Jun 2025` → phone as a tap-to-call link (`tel:`, with a phone icon, spoken "(call)") → **Archive (hide)** button (only while not archived).
  - Banner words: ended, not archived → `Membership ended 31 May 2026`; archived, still running → `Archived 2 Jun 2026 · Membership ends 31 Dec 2026` + **Restore**; archived and ended → `Archived 2 Jun 2026 · Membership ended 31 May 2026` + **Restore**. Running and not archived → no banner. Dates always with the year; the archive day is the device's day.
  - **Archive (hide)** → confirm sheet (bottom sheet on phones, centred dialog from 1024 px): "Archive Surya Pratap?" / "They'll be hidden from search and Home. You can restore them later." [Cancel] [Archive]. Success → toast "<Name> archived.", the banner appears, the Archive button goes, **Restore** appears.
  - **Restore** (no question) → toast "<Name> is back on the list.", banner loses its archived part.
  - Loading: grey name and two lines. Failed: "Couldn't load this." [Try again]; unknown id: "We couldn't find that. It may have been removed." (no retry).
  - **Edit** is the frame's button in the page header (not repeated here).
- **MembershipBlock**: card `Annual · [Active] 241 days left` and a line `Ends 31 May 2026` (`Ended 31 May 2026` when ended). Badge words: **Active**, **Ends soon** ("Ends in 7 days" / "Ends tomorrow" / "Ends today"), **Ended** ("Ended yesterday" / "Ended 5 days ago"); a membership that starts later: **Active** "Starts 20 Oct". 1 day left reads "1 day left". No Renew button yet (round B). Loading: grey card. Failed: "Couldn't load this." [Try again] inside the block; the rest of the page keeps working.

## Round B (slices 4-5) — admin: renew, edit membership, memberships ending (frontend-dev, Stream B)

Permission for every screen below: the shared login (any signed-in visitor). "Today" = the device's day; the server stays the judge.

### S9 Renew / Edit membership — sheet (no URL of its own)
Opened from: member page `/admin/members/[memberId]` (**Renew** button in the membership card; a row of "Membership history"), and **Renew** on a row of Home (`/admin`) and S4 (`/admin/memberships`). Bottom sheet on phones (swipe down or Back closes it), centred dialog from 1024 px; X button at the top right. Works for archived members too (BR-REC-58).
- **Renew**: title "Renew membership", the member's name under it. Fields: **Membership \*** chips Monthly · Quarterly · Half-annual · Annual, starts on the member's LAST plan; **Starts on \*** starts as the last end + 1 day (a past or future day is allowed; both changeable). Live line `Ends 31 May 2027` (follows plan and start; always with the year). Buttons: **Cancel**, **Renew** ("Saving…" + spinner while saving; Cancel is off then). No "Are you sure?".
- **Edit membership** (tap a history row): same sheet, title "Edit membership", filled with that period's plan and start; button **Save**. Only a changed plan/start is sent. Nothing changed → closes with no request (an archived member with a period that covers today: the save is still sent, see the line below).
- Archived member only: a line under "Ends …" `Renewing brings Surya Pratap back to the list.` (on Edit: `Saving brings … back to the list.`), shown only while the typed plan and start make a membership that covers today (an old binder entry or a later start: no line).
- Opened from a list row the member is loaded when the sheet opens: grey form shapes first; failed → "Couldn't load this." [Try again] inside the sheet (no buttons until loaded).
- Every opening starts fresh (Cancel, change plan, reopen → defaults again).
- Success: sheet closes; toast `Anita Rao renewed.` (Renew) / `Saved.` (Edit) / `Anita Rao is back on the list.` (instead, when the save brought an archived member back). The member page, the lists and both Home sections refresh.
- Server refusals under **Starts on** (the sheet stays open, button usable again): `PERIOD_OVERLAP` "This overlaps another membership. Change the start date."; `START_BEFORE_JOIN` "Membership can't start before the join date. Pick a later start date."; `VALIDATION_ERROR` under the field it names. Anything else (`RATE_LIMITED`, `IDEMPOTENCY_KEY_REUSED`, offline "Couldn't save. Check your connection and try again.") a toast.
- Renew sends an `Idempotency-Key`: Renew tapped again with the same plan/start after a lost answer reuses the key (one membership, not two); changed details get a new key.

### S7 member page — MembershipBlock (changed)
- Card: `Annual · [Active] 241 days left`, then `Ends 31 May 2026` with **Renew** at the right (secondary button).
- **Membership history** (title above a list) only when the member has MORE THAN ONE membership, newest first: each row `Annual` / `1 Jun 2025 – 31 May 2026` (plan, then dates with the year, `>` at the right); tap → Edit membership.
- Loading: grey card (no Renew yet). Failed: "Couldn't load this." [Try again].

### S4 Memberships ending — `/admin/memberships?tab=ending|ended`
- Header: back arrow to Home, title "Memberships ending". No main action.
- Tabs **Ends soon** (`tab=ending`, default) and **Ended** (`tab=ended`); the tab is in the URL (Back from a member returns to the same tab; unknown value = Ends soon).
- Rows (not a table): name; phone `98450 12345`; status badge under the phone: Ends soon → `Ends in 4 days` / `Ends tomorrow` / `Ends today` (amber, triangle); Ended → `Ended yesterday` / `Ended 5 days ago` (red, circle !). **Renew** button at the right of each row. Tapping the row (not Renew) opens `/admin/members/<id>`. Order: Ends soon = soonest first; Ended = last 30 days, most recent first. Archived members are never listed.
- 25 rows then a full-width **Show more** ("Loading…" while it loads; gone when no more; failed → "Couldn't load this." [Try again] under the rows).
- Empty (one sentence, no button): Ends soon "Nobody's membership is ending soon."; Ended "No memberships ended in the last 30 days."
- Loading: tabs + 8 grey rows (route `loading.tsx`, then grey rows while the first page loads). Failed first load: "Couldn't load this." [Try again].
- Renew on a row opens S9 for that member; after Renewing the row leaves the list.

### Home `/admin` — slot MembershipSections (new)
- **Memberships ending** (count) then **Recently ended** (count): each shows the first 5 rows (same rows as S4, with Renew) and **See all** → `/admin/memberships?tab=ending` / `?tab=ended` (count and See all only when the section has rows).
- Empty section: the same one sentence as S4, no See all.
- Each section loads and fails on its own: 3 grey rows; failed → "Couldn't load this." [Try again] inside that section, the other keeps working.
- Renew from a Home row = 2 taps: tap **Renew** on the row, tap **Renew** in the sheet.
