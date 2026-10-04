# Manual checklist: member-records/members (Stream B) — v1 spec, written from the spec (members.md, ux.md)
Tick each box; a failed box gets a note + screenshot. "Today" = the device's day. No sign-in needed beyond the one shared login.
## Setup (once)
- [ ] `backend/.env` has `PORT=4002`, `APP_ORIGIN=http://localhost:3002` (else writes get 403); `frontend/.env.local` has `API_URL=http://localhost:4002/api`
- [ ] Terminal 1 `cd backend && bun run db:reset && bun run dev` · terminal 2 `cd frontend && bun run dev -- -p 3002` · terminal 3 `cd backend && bun run bootstrap-admin`, then sign in at http://localhost:3002/login
- [ ] Sizes: 360 and 430 px phone (DevTools), tablet portrait 800 px (sheets, bottom tabs), landscape 1180 px (side bar, dialogs); once on a real phone at `http://<laptop-ip>:3002` (add it to `APP_ORIGINS_EXTRA`)
- [ ] Order: do "Fresh DB" first, then add the data below through S6, then `bun run seed:perf` (1,000 more members) for the 25-per-page checks
- [ ] Data (pick Starts on so the live "Ends" line shows the wanted day): Surya Pratap 98450 12345, DOB 1982-05-10, Male, Annual, ends in 4 days · Anita Rao 99000 11111, Monthly, ended yesterday · Surya K, Asura M, Annual, ends in 6+ months
- [ ] More data: Chitra Rao (Anita's phone), Annual, then archive her · "Ended 30", "Ended 31", "Ended 45" (ended that many days ago) · "Binder Old": joined 2 y 6 m ago, Annual from that day, then archive · "Ends Today", "Ends Tomorrow", "Ends 7", "Starts Later" (starts in 10 days)
## Fresh DB (empty states; BR-REC-130, 53, 57)
- [ ] `/admin/members`: "No members yet." and one secondary Add member button; each chip shows one sentence (No active members. / No memberships end soon. / No ended memberships. / No archived members.); search "zz" shows `No member matches "zz".`
- [ ] Home and `/admin/memberships` (both tabs): "Nobody's membership is ending soon." / "No memberships ended in the last 30 days."; no count, no See all, no button
## S6 Add member `/admin/members/new` (360 and 430 px)
- [ ] BR-REC-134, 121, 129, 120 Open from Members: grey form shapes first (no page spinner); one column, label above, * on required, bottom tab bar hidden, one full-width Add member bar at the bottom, no Reset; no plan and no sex chosen, Joined on = today
- [ ] BR-REC-134, 03, 05 Tap Add member on the empty form: page scrolls to Full name with the cursor in it; fill it, tap again: jumps to Phone, then Date of birth, Sex, Membership; the button stays tappable and each message matches its field
- [ ] BR-REC-134, 45 Bad Email ("abc") or Notes over 1,000 characters: the closed "More details" opens by itself and the page jumps to it ("Enter an email like name@example.com" / "Use at most 1,000 characters")
- [ ] BR-REC-45 Name " Surya  Pratap " saves as "Surya Pratap"; 1 letter shows "Use at least 2 letters"; 81 letters shows "Use at most 80 characters"
- [ ] BR-REC-46 Phone "+91 98450-12345" and "(98450) 12345" are accepted; "12345" shows "Enter 10 to 15 digits, like 98450 12345"
- [ ] BR-REC-47, 04 Duplicate timing: type Anita's number, nothing shows while typing; tap into the next field and "Also used by Anita Rao · Open" appears; typed as "9845..." without +91 it still matches (last 10 digits)
- [ ] BR-REC-47 Open opens Anita in a NEW tab and the typed values stay; with Chitra (archived) the line reads "Anita Rao · Open, Chitra Rao (archived) · Open"; Add member stays enabled and saves; a second "Surya Pratap" with a new phone also saves
- [ ] BR-REC-48 Date of birth: tomorrow cannot be picked and a forced one shows "That date is in the future. Pick today or an earlier day."; birth year 1920 and an age of 8 show an AMBER "Please check the date" and still save
- [ ] BR-REC-50, 05 Starts on follows Joined on until you change it by hand; a day before Joined on shows "Membership can't start before the join date"; a past start (historical) and a future start are accepted
- [ ] BR-REC-08, 51 Live line, always with the year, follows plan and start at once: Monthly 15 Jan 2026 → "Ends 14 Feb 2026"; Monthly 31 Jan 2026 → 28 Feb 2026; Quarterly 1 Mar 2026 → 31 May 2026; Annual 29 Feb 2028 → 28 Feb 2029
- [ ] BR-REC-49 Sex offers only Male and Female; Goal "Not set" clears a chosen goal
- [ ] BR-REC-03, 05, 59 Save a full member: toast "<Name> added." and the member page opens showing age 44 for DOB 1982-05-10 (age computed from the date of birth)
- [ ] BR-REC-132 Fill the form, go offline: banner "You're offline — changes can't be saved right now" within 2 s; Add member shows a toast "Couldn't save. Check your connection and try again."; values are kept; back online the banner goes and ONE tap on Add member makes exactly one member
## S5 Members `/admin/members` and Home search
- [ ] BR-REC-135, 125, 122, 139 At 360 px: rows (never a table) with name, detail line "98450 12345 · Last 12 Sep" or "· Never assessed", and a right badge with words + icon + colour; no sideways scroll; in a grey-scale screenshot the badges still read
- [ ] BR-REC-07 Type "s": nothing is searched and the list stays; "su" searches about a quarter second after the last key; the old rows stay dimmed until the new ones arrive; the clear button resets
- [ ] BR-REC-56, 07 "sur", "SUR" → Surya K, both Surya Pratap, then Asura M; "9845012345", "98450 12345" and part of an email find Surya Pratap
- [ ] BR-REC-57 Chips (one always chosen, All at start): Active, Ends soon and Ended each show only those; text and chip are in the URL (`?q=sur&status=ended`); open a member then Back: same list, chip and text
- [ ] BR-REC-06, 57 Archived chip: only archived members, detail "Archived 2 Jun · Ended 31 May" (or "Ends 31 Dec"), badge Archived; "sur" there finds archived Suryas only; archived members never appear under All or in Home search
- [ ] BR-REC-56, 57, 131 After seed:perf: 25 rows then a full-width Show more ("Loading…" while it loads, adds 25, gone at the end, A–Z continues without repeats); with the network off: "Couldn't load this." [Try again]
- [ ] BR-REC-07, 140 Home: Search members under the title; "su" shows rows above the Home sections; 1 tap on the field + typing + 1 tap on a row opens the member; no match shows `No member matches "xx".`; nothing for 1 letter
- [ ] BR-REC-07 Long text: paste 150 letters (e.g. "a" × 150) into the Home search, then into the Members search, and open `/admin/members?q=` + 150 letters by hand: each shows the results for the first 100 characters or `No member matches "…"`, never "Couldn't load this." and no Try again
- [ ] BR-REC-121, 139, 135 Phone: Add member is one bar above the tabs; at 1180 px it sits at the right of the header; at 1280 px the list is centred, max 1080 px. KNOWN GAP: phone and last assessment as desktop columns are not built, so note it, do not fail
- [ ] BR-REC-129, 131 Throttle to Slow 3G and reload: search, chips and 8 grey rows; stop the API: "Couldn't load this." [Try again]; restart and tap it: the list loads
## S7 Member page `/admin/members/<id>` (header + membership block)
- [ ] BR-REC-59 Open Surya Pratap: name, "44 y · Male · Joined …", phone as a tap-to-call link (a real phone opens the dialer), card "Annual · Active · N days left" + "Ends …"; "1 day left" reads singular; the Record assessment / Report card / All assessments buttons are listed as N/A if their stream is not merged
- [ ] BR-REC-52, 08 Status words: "Ends 7" → Ends soon · "Ends in 7 days"; "Ends Tomorrow"; "Ends Today"; "Ended 30" → Ended · "Ended 30 days ago" and line "Ended …"; "Starts Later" → Active · "Starts 20 Oct"; after Renew on "Ends 7" with the default start (renewed early) → Active, not Ends soon
- [ ] BR-REC-172 Banner under the title, dates with the year: ended, not archived → "Membership ended 31 May 2026", no Restore; archived and running → "Archived 2 Jun 2026 · Membership ends 31 Dec 2026" + Restore; archived and ended → "Archived … · Membership ended …" + Restore; running → no banner
- [ ] BR-REC-58, 133, 138 Archive (hide): a bottom sheet on phones (swipe down or Back closes it and nothing changes), a centred dialog at 1180 px; text "Archive Surya Pratap?" / "They'll be hidden from search and Home. You can restore them later." [Cancel] [Archive]
- [ ] BR-REC-58, 138 FIRST Archive tap on a freshly loaded page (hard reload with Cmd+Shift+R, no sheet opened yet): the confirm slides up from the bottom at 360 and 430 px and fades in as a centred dialog at 1180 px, not a sudden pop; one tap is enough; a second Archive (after Cancel) opens the same way
- [ ] BR-REC-58, 132, 138 Archive with no connection BEFORE the first tap: hard reload the member page, then airplane mode (real phone) or DevTools Network → Offline, tap Archive: ONE toast "Couldn't load this. Try again.", nothing opens, nothing changes; go online, tap Archive again: the confirm opens (slide-up / fade) and Archive works
- [ ] BR-REC-06, 58 After Archive: toast "Surya Pratap archived.", banner appears, Archive goes, Restore appears; the member is gone from Members (All), Home search and Home sections, present under the Archived chip
- [ ] BR-REC-58, 133 Restore asks nothing: toast "Surya Pratap is back on the list.", the archived part of the banner goes, member is back in search
- [ ] BR-REC-58 On an archived member: Edit, change the phone, Save: it stays archived (banner and hidden from search)
- [ ] BR-REC-09 Membership history shows only with 2+ memberships, newest first: "Annual" / "1 Jun 2025 – 31 May 2026" with ">"; tap opens Edit membership
- [ ] BR-REC-129, 131 Throttled: grey name and card; API off: "Couldn't load this." [Try again] in the membership block while the page keeps working; a made-up id shows "We couldn't find that. It may have been removed." with no retry
## S8 Edit member `/admin/members/<id>/edit`
- [ ] BR-REC-03, 45 Same form without Membership, Starts on and Ends line, filled from the member; More details open when email, goal or notes exist; title "Edit member", Save in the bar, back arrow to the member page
- [ ] BR-REC-47 The phone's duplicate warning never names this member (tap in and out of their own phone: nothing); change to Anita's number: it names Anita
- [ ] BR-REC-45 Nothing changed → Save goes straight back, no toast, no request (DevTools Network); one field changed → toast "Saved." and the new value shows on the page
- [ ] BR-REC-50, 55 Move Joined on after a membership start: under Joined on "A membership starts before this date. Pick an earlier join date."
## S9 Renew / Edit membership sheet
- [ ] BR-REC-54, 138 Renew on Anita Rao's page: bottom sheet on phones (X top right, swipe down or Back closes it), centred dialog at 1180 px; "Renew membership" + name; plan = last plan, Starts on = last end + 1 day; the live "Ends …" line follows any change
- [ ] BR-REC-54, 138, tactic 4 FIRST Renew tap on a freshly loaded page (hard reload with Cmd+Shift+R each time), once on the member page, once on a Home row, once on an S4 row: the sheet slides up at 360 and 430 px and fades in as a centred dialog at 1180 px, not a sudden pop; the form is there as soon as the member has loaded (grey form shapes only while it loads, e.g. on Slow 3G, then none left); no second tap needed
- [ ] BR-REC-54, 132, 138 Renew with no connection BEFORE the first tap: hard reload Home (also S4 and the member page), then airplane mode (real phone) or DevTools Network → Offline, tap Renew: ONE toast "Couldn't load this. Try again.", nothing opens (no sheet, no grey shapes), Renew stays usable; go online, tap Renew again: the sheet opens and works. (Not the same as "Renew offline" below, where the sheet is already open.)
- [ ] BR-REC-54, 133 Pick Annual: before saving the line is the day before the same date a year on (last end 31 May 2026 → Starts 1 Jun 2026 → "Ends 31 May 2027"); Renew has no "Are you sure?", shows "Saving…" + spinner; toast "Anita Rao renewed."; page, history and lists refresh
- [ ] BR-REC-09, 55 Start inside the previous period: under Starts on "This overlaps another membership. Change the start date."; the sheet stays open and Renew works again; a start before the join date shows its own line
- [ ] BR-REC-55 Tap a history row: "Edit membership" filled with that plan and start, button Save; changing start moves the Ends line; into the previous period → refused; nothing changed → closes with no request
- [ ] BR-REC-54 Cancel, change the plan, reopen: defaults again every time
- [ ] BR-REC-58 "Binder Old" (archived, long ended): Renew with defaults, the Ends line is in the past → no "Renewing brings … back" line; saved → "renewed.", still archived; Renew again, Ends line reaches today or later → "Renewing brings Binder Old back to the list." appears; saved → toast "Binder Old is back on the list.", banner gone, in search and Home
- [ ] BR-REC-132 Renew offline: banner, then toast "Couldn't save. Check your connection and try again."; values kept; back online one tap makes exactly one new membership
- [ ] BR-REC-140, 54 Home "Ends soon" row: tap Renew, tap Renew in the sheet = 2 taps; the row leaves the section and the counts update
- [ ] BR-REC-140, 54 Same on a freshly loaded Home (hard reload, then Slow 3G) with a row you have not touched before: still exactly 2 taps (Renew on the row, Renew in the sheet); no extra tap to open the sheet or load the member; the sheet may show grey shapes first, then the form
## S4 `/admin/memberships?tab=ending|ended` and the Home sections
- [ ] BR-REC-53 Tabs Ends soon (default; unknown `tab` too) and Ended; tab in the URL; back arrow to Home; no main action; tap a row (not Renew), Back: same tab
- [ ] BR-REC-53, 125, 122 Rows: name, phone, badge under it ("Ends in 4 days" amber triangle; "Ended yesterday" / "Ended 5 days ago" red circle), Renew at the right (44 px, 8 px gap, opens the sheet, not the page); Ends soon soonest first; Ended most recent first
- [ ] BR-REC-53 "Ended 30" is listed, "Ended 31" and "Ended 45" are not; archived members never appear in either list; after Renew the row leaves
- [ ] BR-REC-53, 131 Home: "Memberships ending" then "Recently ended", each with a count, 5 rows with Renew and See all (right tab); S4 after seed:perf: 25 rows + Show more
- [ ] BR-REC-131 DevTools block `*memberships/ending?status=expired*`: only Recently ended shows "Couldn't load this." [Try again]; the other section works
## Whole pass
- [ ] BR-REC-120, 139, 137 Every screen above at 360 px and 200% text zoom: no sideways scroll; bottom tabs (Home, Members, Reports, Settings) under 1024 px and hidden on forms and sheets, side bar from 1024 px
- [ ] BR-REC-140 Tap budgets on a phone: find a member 2 taps + typing; add a member 1 screen; renew from Home 2 taps
- [ ] Deferred to M4, not this PR: type 3 real binder members end to end (the three binder cases) and check search, Home and the member page against the paper
