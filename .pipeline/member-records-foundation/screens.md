
## S3a — frontend foundation (frontend-dev)
Permission: any signed-in user (shared login; proxy.ts guard, auth stream refines). All routes under `/admin`.

**App shell** (every `/admin/**` page)
- Under 1024 px: bottom tab bar Home · Members · Reports · Settings (icon + word, current one marked); hidden while a sheet, dialog or form action bar (`ActionBar form`) is open.
- From 1024 px: left side bar with gym name (default "Fionis CrossFit"), the same four items, **Sign out** (drawn but off until auth lands).
- Offline banner at the top: "You're offline — changes can't be saved right now" (appears on `offline`, goes on `online`).
- `/` shows Home without changing the URL; `/api/*` is forwarded to the API.

**Home `/admin`** (frame, no data yet): title = gym name; sections in order Overdue, Due soon, Memberships ending, Recently ended, each as grey rows (placeholder slots). Phone: one column. Desktop: due sections left, membership sections right, 1080 px max. States: loading (grey rows, same layout), error (`error.tsx`: "Couldn't load this." [Try again]).

**Member page `/admin/members/[memberId]`** (frame): back arrow to Members, title "Member", **Edit** (header, always), main action **Record assessment** (bar above the tabs on phone, header right on desktop), grey blocks Membership / Assessments / Recent (+ header block), buttons **All assessments** and **Report card**. Detail width 720 px; two columns from 1024 px.

**Placeholder screens** ("This screen is not built yet."): `/admin/members`, `/admin/members/new`, `/admin/members/[id]/{edit,assess,assessments,report}`, `/admin/reports`, `/admin/settings`. Route folders with only loading + error (no page yet): `/admin/due`, `/admin/memberships`, `/admin/settings/{assessments,general,account,export}`.

**Look and feel to check by eye:** inputs and default buttons are 48 px tall, text 16 px; the three fonts (Outfit text, Raleway titles, Geist Mono only where digits line up); status words come with an icon; light and dark both readable.
