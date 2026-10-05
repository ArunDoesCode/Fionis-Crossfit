
## U3 dates (frontend-dev)
All dates are now `DatePicker` (button shows `dd MMM yyyy`, calendar opens in a popover; Monday first; tomorrow etc. greyed) or `MonthPicker`.
- `/admin/members/[id]/assess` (permission: record assessments): Date picker, max today; before join date only warns; Q1-Q4 chips still set the date.
- `/admin/due` row sheet > Remind me later > Pick a date (due-list permission): inline calendar in the sheet, tomorrow..+90 days; error line under it after "Set reminder".
- `/admin/members/new`, `/admin/members/[id]/edit` (member create/edit): Date of birth (month + year dropdowns 1900..this year, no future), Joined on (max today); Starts on in the membership part (also Renew / Edit membership).
- `/admin/reports` (reports permission): "Joined from" / "Joined to" month pickers (year stepper, 12 buttons, Clear); "to" disables months before "from"; URL keeps `joinedFrom=YYYY-MM`.
- Everywhere: dates read "03 Oct 2026" (year always), estimated stay "≈ Dec 2025".
