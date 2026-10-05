# Manual checklist: member-records-ux-v2-u1 (ux.md v5, performance.md v2)

Setup: run the frontend (`bun run build && bun run start` for CLS/fonts/print checks, dev is fine otherwise). Sign in as a
role that can record assessments (owner or trainer) with a member that has a long Record assessment form.
Devices: laptop Chrome + Safari, iPhone Safari, Android Chrome. Widths via browser responsive mode unless a device is named.
Format: where | action | expected.

## Viewports (BR-REC-178, 182)
- [ ] `/admin`, `/admin/members`, member page, `/assess`, `/report`, `/admin/reports` at 360 px | load each | no sideways scroll; top bar shows ☰ + title; no bottom tab bar
- [ ] Same pages at 800 px | load first time (clear cookies) | sidebar collapsed to icons with tooltips; no ☰
- [ ] Same pages at 1280 px | load first time (clear cookies) | sidebar expanded with wordmark
- [ ] `/admin/members` at 1440 and 1920 px | load | table/list capped at 1280 px wide, centred
- [ ] Add member, Edit member, member page at 1920 px | load | content capped at 896 px
- [ ] Record assessment at 1920 px | load | content up to 1280 px wide
- [ ] Record assessment at 800 px | load | 2 columns where they fit, nothing cut off

## Sidebar fixed, only content scrolls (BR-REC-177)
- [ ] Record assessment at 1280 x 600 (laptop Chrome) | scroll page to the bottom | sidebar does not move; Sign out and theme toggle stay visible; only the content scrolls
- [ ] Same at 1440 and 1920 | scroll long page | sidebar fixed, no double scrollbar
- [ ] Sidebar | resize window height small | sidebar items stay reachable (sidebar itself scrolls, Sign out reachable)

## Collapse remembered (BR-REC-177, ux.md "Sidebar remembered state")
- [ ] 1280 px | click the header sidebar button to collapse, reload | stays collapsed, no flash of expanded on first paint
- [ ] 1280 px | expand again, reload | stays expanded
- [ ] 1280 px | collapse, Sign out, sign in again (client-side nav to `/admin`) | still collapsed
- [ ] 800 px | expand with the button, reload | stays expanded (choice beats the first-visit default)
- [ ] Collapsed sidebar | check | orange "F" on rounded orange square, 44 px icon buttons; expand shows wordmark (BR-REC-186)
- [ ] Any admin page | press Ctrl+B (Windows/Linux) / Cmd+B (Mac) with focus on the page body | sidebar does NOT toggle (no shortcut)
- [ ] Any text field or rich-text/editable field | press Ctrl/Cmd+B | bold toggles as normal, sidebar unchanged

## Drawer on phones (BR-REC-178)
- [ ] 360 px, iPhone Safari | tap ☰, tap Members | drawer closes, Members shown
- [ ] 360 px, Android Chrome | tap ☰, press Esc (external keyboard / emulator) | drawer closes
- [ ] 360 px, Android Chrome | tap ☰, press system Back | drawer closes, stays on the same page, no navigation away
- [ ] 360 px, iPhone Safari | tap ☰, tap the dimmed area outside | drawer closes
- [ ] 360 px | open drawer | theme toggle and Sign out reachable; Sign out works
- [ ] 360 px | open then close drawer 3 times, then Back once | goes to previous page (no stray history entries)

## Drawer + unsaved form (BR-REC-178, 179)
- [ ] 360 px, Record assessment | type a value (form dirty), tap ☰, tap Members | drawer closes AND the "leave without saving?" question appears
- [ ] Same | choose Stay | stays on form, values intact, drawer closed, Back goes to the member page (no extra history entry)
- [ ] Same | repeat, choose Leave | lands on Members; Back does not return into a stray drawer state
- [ ] Same form, dirty | tap "‹ Member" back link | leave question appears

## Back target while loading (BR-REC-179)
- [ ] DevTools network throttle "Slow 3G"; from member page open Record assessment | watch first frames | back target (phone "‹ Member", desktop breadcrumb) is the member page from the first frame and never changes
- [ ] Same for Edit member (back = member page), Due list (back = Home), All assessments, Report card | open under throttle | parent correct from first frame, same after load
- [ ] Memberships ending | open | top-level, no back link or breadcrumb parent

## Breadcrumbs vs "‹ Parent" (BR-REC-179)
- [ ] 1280 px, Record assessment | look at header | breadcrumbs "Members / Member / Record assessment" with static labels (not the member's name)
- [ ] 800 px | same | breadcrumbs shown
- [ ] 360 px, Record assessment | look under top bar | single "‹ Parent" link above the title, no breadcrumbs
- [ ] Breadcrumb/back link | click | real link navigation (open in new tab works)

## One main action (BR-REC-180)
- [ ] 1280 px, member page | scroll down a long page | page header stays visible; "Record assessment" top right
- [ ] 1280 px, Add member / Record assessment | scroll to bottom | Save visible at every scroll position
- [ ] 360 px, Add/Edit member, Record assessment, Gym settings, Account | scroll | Save in a 48 px bottom bar, always visible; with the keyboard open (iPhone Safari, Android Chrome) the bar sits above the keyboard
- [ ] 360 px, lists and member page | look | main action in the top bar, not a bottom bar
- [ ] Every screen visited above | look | never two primary (orange) buttons

## Density and CLS (BR-REC-181)
- [ ] Laptop 1440 x 900 with mouse, Home | measure | controls 40 px, rows 48 px, header 56 px, page padding 24 px; visibly more rows than before (about 30%)
- [ ] 360 px touch (iPhone Safari) | tap targets | at least 44 px, list rows at least 56 px, 8 px between neighbours
- [ ] Home, Members, Member, Record assessment (production build) | DevTools Performance / Lighthouse | CLS 0.05 or less; logo and sidebar cause no shift (0)
- [ ] Reload with collapsed sidebar | observe | no layout jump when the page hydrates

## Colours, contrast, nav pill (BR-REC-184, 185, 186)
- [ ] All admin screens, light and dark | run axe (browser extension) | 0 contrast issues, including the "F" mark and orange buttons
- [ ] Sidebar, any page | look at the current page item | orange-tint pill with orange icon and text; no flat grey active state; same in dark
- [ ] Primary buttons | look | orange with navy text, never white text
- [ ] Home | look at overdue / due soon / active / reminder / ended badges | danger / warning / success / info / neutral tones, each with icon and words
- [ ] Sparklines and KPI numbers | look | orange; empty states have a faint orange wash

## Wordmark and logo (BR-REC-186)
- [ ] Expanded sidebar, light and dark | look at top | Fionis wordmark, crisp, correct ratio, no jump on load
- [ ] Collapsed sidebar | look at top | orange "F" square placeholder, not the wordmark
- [ ] `/login` on the white card, laptop Safari + Chrome and iPhone Safari | look | wordmark above the card, AVIF renders (not blank/broken), readable on the white background. OWNER TO CONFIRM it looks right
- [ ] `/login` dark mode | look | wordmark still legible

## Fonts network (performance BR-REC-214)
- [ ] `/login` with DevTools Network (Font filter), hard reload, production build | inspect | Outfit preloaded; Poppins fetched for the title; Geist Mono never requested
- [ ] A screen with number columns | open | Geist Mono requested only there
- [ ] Throttled load | watch text | text visible at once in fallback font, swaps without a visible jump

## Print (screens S12)
- [ ] Report card, laptop Chrome and Safari | print preview | no sidebar, top bar, header buttons or bottom bar; colours black on white as before; fits the page
- [ ] Same at 360 px window | print preview | same result

## Raw colours (BR-REC-184)
- [ ] Toggle theme on each screen | look | no leftover hard-coded colours (anything that does not change with the theme)
