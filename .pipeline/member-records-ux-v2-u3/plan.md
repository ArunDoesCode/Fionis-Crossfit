# Plan — member-records ux v2, slice U3 (dates)
Spec ux.md v7: BR-REC-191–194, performance BR-REC-215 (lazy calendar chunk). Issues #50, #51 (+#16 DateField hooks removed). Frontend only.
- [ ] tests (test-writer): day bridge TZ round trip, formatDay, month helpers, source checks (no native date inputs, lazy calendar, WEEK_STARTS_ON).
- [ ] frontend-dev: `bunx --bun shadcn@latest add calendar`; DatePicker (popover; inline variant in sheets), DatePickerCalendar (dynamic), MonthPicker; replace DateField/MemberDateField/MonthField/useDeferredDate at all 8 call sites (Record assessment date, Remind-me-later, DOB, Joined, Starts on, 2 month filters); `formatDay` everywhere.
- [ ] verify with U2: reviewer + test-runner.
