
## Slice C: modals + native controls (frontend-dev)
- Every ResponsiveSheet/ConfirmSheet user (any admin permission that reaches them): phone sheet is now shadcn Drawer (swipe handle, close X, buttons pinned under a scrolling body); desktop dialog scrolls inside, buttons stay visible.
- Assessment leave guard (`/admin/members/:id/assessments/...` entry): "Leave without saving?" is now a ConfirmSheet with [Stay] / [Leave] (bottom sheet on phone, dialog on desktop). No Back-to-close.
- Settings > Gym (`GymSettingsForm`, setup permission): Time zone is a searchable picker (type "kolk" to find Asia/Kolkata), not a native select.
- Member form (create/edit, `MoreDetailsFields`): "More details" is a Collapsible; fields unchanged. Save still opens it on a problem inside.

## Slice B-2 setup forms (frontend-dev)
- `/admin/settings/general` (Reminders & gym), permission that reaches S16 (settings): fields Gym name, Time zone (searchable combobox), Due soon, Ends soon in a 2-column grid from ~480 px form width; "N things to fix" summary from 3 errors; Save jumps to the first problem; Save with no edits: no request, no toast; no Reset.
- Assessment sheet (Add / Edit, `/admin/settings/assessments`): Name, Repeat every number + weeks/months, On switch (edit); wider desktop dialog, 2 columns; unchanged Save closes silently.
- Measurement sheet (Add / Edit, under an assessment): Name, Kind, Unit, Decimals, Better, Please check below/above (Time = one min:sec field each), Repeat (same / own number + unit), Report table (group + part), On (edit); 2 columns on the wide desktop dialog; summary from 3 errors.

## Slice B-1 members + auth forms (frontend-dev)
- Add member (`/admin/members/new`, members.write): 2 columns from ~480 px form width: Full name · Phone / Date of birth · Sex / Joined on · Membership / Starts on · "Ends …" line; "More details" (Email · Goal / Notes) spans both. Floating labels, `*` on required, errors inside each 76 px item (nothing moves). Failed Save: "N things to fix" summary from 3 errors (links), focus on first problem (opens More details if needed). Enter saves; no Reset; Save off only while saving. Leaving with typing (Back, any link, tab close) asks "Leave without saving?" [Stay] [Leave]; after a successful Save no question.
- Edit member (`/admin/members/:id/edit`, members.write): same minus plan/starts-on; Save with no change: no request, no toast, back to the member; same leave question when dirty.
- Renew / Edit membership sheet (members.write): Membership chips + Starts on + "Ends …" in one grid (2 columns when wide); archived restore note spans both; no leave question (spec: only Add/Edit member).
- Login (`/login`): Username, Password (Show/Hide inside the box), Keep me signed in, server error line unchanged; Enter signs in; first problem focused.
- Change password (S17, any signed-in user): Current password · New password (hint "At least 8 characters" until an error shows); wrong current password shows at its field.

## Slice B-3 Record assessment (frontend-dev)
- `/admin/members/:id/assess?type=&date=` (assessments.write): now one real `<form>`: Enter in any box saves; "Save" and "Save & next date" are submit buttons in the header (Save is the Enter button); off only while saving; no Reset. Single column for now (grid = U4).
- Save with nothing entered (new, or every stored value cleared): red "Enter at least one value" alert at the TOP of the form, read out again on every click, cursor jumps to the first measurement; no request. Typing a value removes the alert.
- Bad number ("9x5"): "Enter a number like 95.5" inside that field's 76 px item (on leaving the box, and on Save); Save with 3+ bad fields: "N things to fix" summary with links, cursor on the first one. Time out of range: "Enter minutes from 0 to 599" / "Enter seconds from 0 to 59".
- Time measurement = one field "Plank (min:sec)" with min and sec boxes under one label. Number fields: label floats, unit inside the box at the right.
- Line under each field (same height as an error): "Last 95.5 kg · 12 Sep" left, live change "▼ −1.5 kg better" or "Will be removed" right; an odd value shows "Please check — last time 8" in place of the "Last" line (after leaving the box or Save).
- Date: still the plain date box (U3 replaces it); "Pick a date" / the future-date sentence show inside it. About = checkbox in its own item with the label above. Paper column chips unchanged.
- Unchanged: drafts (restore question), "Open the saved one?", leave question, "Check these values" sheet, Edit · date badge, an edit with no change closes without a request and without a toast.
