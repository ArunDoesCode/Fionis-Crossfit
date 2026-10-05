
## S1 theme (frontend-dev)
- No new page or button. All admin screens, any permission: Fionis tokens (light + dark), Poppins headings.
- Home / Members / Due list rows: hover tint is orange (`bg-accent/50`); status badges gain an `info` tone (blue, "i" icon).
- Empty states: faint orange wash and orange dashed border. Progress sparklines: orange.
- Desktop mouse >= 1024 px: denser controls and rows (40 / 48 px); touch and narrow keep 48 / 64 px.
- Print report card: print colours are now the CSS words `white` / `black` (same look).

## S2 shell (frontend-dev B)
- Every `/admin/**` page, any signed-in role: fixed navy sidebar (logo, Home, Members, Reports, Settings, theme toggle, Sign out). No bottom tab bar anymore.
- >= 1024 px: expanded; 768-1023 px: icon-collapsed ("F" orange square, tooltips) on first visit; the header's sidebar button (left of the title) collapses/expands it; the choice is remembered (cookie `sidebar_state`, applied right after load).
- < 768 px: sticky top bar = ☰ + title + (secondary) + main action; ☰ opens the same items as a drawer that closes on a link, Esc, Back or a tap outside. Forms (Add/Edit member, Record assessment, Gym settings, Account) keep Save in a bottom bar on phones.
- Page header: breadcrumbs from 768 px on every screen that has a parent ("Members / Member / Edit member"); "‹ Parent" link under the top bar on phones. Back targets now come from `lib/routes.ts` only: Memberships ending is top-level (no back); Due list goes back to Home; Edit member goes back to the member page.
- Main action: right of the sticky header on desktop; in the top bar on phones except forms.
- Widths: forms and detail 896 px, lists, reports and Record assessment 1280 px.
- Login (`/login`, public): Fionis wordmark above the card. Print report card: sidebar and bars hidden as before.
