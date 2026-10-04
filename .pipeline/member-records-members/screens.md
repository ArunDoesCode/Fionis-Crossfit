
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
