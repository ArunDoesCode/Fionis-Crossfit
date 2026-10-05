
## S1 foundation + shell (BR-REC-219, 220, 221, 227, 234, 235)
- **Every admin page** (`/admin/**`, any signed-in permission): new tokens (page #EFF1F6, white cards with shadow, orange primary with #B86200 edge, 5 px radius, dark theme steps), white control fill, 2 px focus outline; tab title "<page> · Fionis India" (member page: the member's name); "Skip to content" link (first Tab stop, appears on focus); table headers 12 px 600 uppercase on a muted band; floating labels and hints 13 px; numbers in Outfit (no Geist Mono).
- **Sidebar** (all admin pages, from 768 px): header = orange "F" square + "Fionis CrossFit" (F only when collapsed); no toggle inside the sidebar; active item = orange-tint pill, 3 px orange bar at the left, orange 600 text and icon; footer row = theme toggle + Sign out.
- **Page header** (all admin pages): from 768 px the sidebar toggle ("Toggle Sidebar") is at the far left of the header; below 768 px ☰ "Open menu" opens the drawer.
- **Forms with a phone Save bar** (Add member, Edit member, Record assessment): bar is last in tab order (after all fields); desktop Save stays in the header.
- **Due row / member assessment line "⋯" button**: announces a dialog popup and open/closed state.
- **Theme**: the "d" key no longer switches theme; use the sun/moon button (sidebar footer, Login).
- **Login** (`/login`, no permission): from 1024 px split — navy left panel with the text wordmark (orange "F" square + "Fionis CrossFit") and "Coach desk", form on white at the right; below 1024 px one card with the same text wordmark above the form. No image.
- **Alerts**: only the error summary and "Enter at least one value" notice are `role="alert"`; the load-error box, delete / confirm questions in sheets use `role="status"`, the Login error line uses `aria-live="assertive"`.
