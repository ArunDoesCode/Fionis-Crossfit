# member-records-ux-v10 — visual refresh "Navy & Flame"

Spec: `docs/specs/member-records/ux.md` v10 (frozen 2026-10-05), BR-REC-219…235 · D-037
Audit: `docs/design/admin-ui-audit/README.md` (tokens: `docs/design/admin-ui-audit/tokens.css`)
Branch: `claude/admin-tool-design-refresh-974c68` (from `main` 26b93c2) · Surfaces: admin only (no backend, no contract change)
Bugs folded in (spec rules already say the right thing): BR-REC-127 phone format, BR-REC-185 "Never recorded" tone,
BR-REC-235 logo redirect, BR-REC-221 grey control fill.

## Slices
- [x] S0 red tests — test-writer, all BRs below (one commit `test(...)`)
- [x] S1 foundation + shell — BR-REC-219, 220, 221, 227, 234, 235 · `globals.css`, `layout.tsx` fonts + title template,
      `ThemeProvider` (no "d" key), admin `layout.tsx` + `_components/AdminSidebar.tsx`, `common/PageHeader.tsx`,
      `common/DatePicker.tsx`, `common/MonthPicker.tsx`, `TimeZoneCombobox.tsx`, `views/auth/LoginView.tsx`, `src/proxy.ts`,
      per-page `metadata`
- [x] S2 lists + Home — BR-REC-222, 223, 225, 226, 233 (empty states), 127, 185 · `common/{ListRow,ChipList,Section,
      EmptyState,StatusBadge,DataTable}`, new `common/MemberAvatar.tsx`, `views/home/HomeView.tsx`, due / members /
      memberships tables and rows, `lib/format.ts`, `lib/statusTone.ts`, `ChooseAssessmentSheet.tsx`
- [x] S3 member page + progress — BR-REC-224, 228, 229 · `views/member/MemberView.tsx`, `pages/member/*`,
      `pages/progress/*`, `views/progress/*`, report card components, `lib/progress/text.ts`
- [x] S4 forms + search — BR-REC-230, 231, 232, 233 (words) · `pages/assessments/*`, `common/MemberSearch.tsx`,
      `DatePicker` parser in `lib/dates/`, add-member fields, `lib/setup/text.ts`, gym settings words
- [x] Verify — reviewer + test-runner, ≤ 2 fix loops
- [x] Knowledge — map, spec Build clarifications, STATUS

Order: S0 → S1 → (S2 ∥ S3 ∥ S4, disjoint files) → Verify.

## Build choices (record in decisions after merge)
- (none yet)
