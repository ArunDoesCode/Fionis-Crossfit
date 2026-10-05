# Plan — member-records ux v2, slice U1 (shell + theme)
Spec: docs/specs/member-records/ux.md v2 (frozen 2026-10-05), performance.md v2. Issues #38–#43 (tracking #59). Frontend only, no contract change.
Branch: claude/ui-ux-responsive-redesign-1de4d4 (single working branch; user's explicit choice for this redesign).
Out of U1: BR-REC-183 tables (U5), 187–199 forms/modals/dates (U2–U3), 200 except the raw-colour check (rest lands with U6/CI).

## Slices
- [ ] **S1 theme** — BR-REC-184, 185, 214, 200(colour check); #41, #43 + brand surfaces #42 (non-shell): tokens in globals.css (brand, info, soft tones, sidebar navy, density tokens BR-REC-181, remove tabbar CSS), Poppins heading font, one status→tone map, StatusBadge info tone, KPI/Sparkline/EmptyState/ListRow brand classes, `check:colors` script + CI step.
  Owner: frontend-dev A — globals.css, app/layout.tsx, lib/domain tone map, components/common/{StatusBadge,Sparkline,EmptyState,ListRow,Skeletons}, scripts/, .github/workflows/ci.yml.
- [ ] **S2 shell** — BR-REC-177…182, 186(logo, nav); #38, #39 (classes), #40, #42 (nav): shadcn Sidebar (`bunx --bun shadcn@latest add sidebar sheet breadcrumb`), AppShell/SideNav/NavLinks, top bar + ☰ below 768 px, collapsed icon sidebar + "F" placeholder, wordmark (next/image) on sidebar + Login, route table (one parent per route) used by loading.tsx + views, PageHeader with crumbs/back + sticky main action, Page widths 896/1280, density classes, remove BottomTabBar/--tabbar-h/data-hide-tabs usage, dvh.
  Owner: frontend-dev B — components/shells/**, components/common/{Page,PageHeader,ActionBar,OfflineBanner}, components/ui/{sidebar,sheet,breadcrumb,…} (CLI install only), app/(app)/admin/**/loading.tsx + layouts, pages/auth/Login*, lib/nav/**.
  Needs S1 token names (brand, sidebar-*, info) — names fixed by spec/issue #41, so both run in parallel.
- [ ] **S3 verify** — reviewer + test-runner, fix loop ≤ 2.

## Order
1. test-writer (red tests, own commit) → 2. frontend-dev A ∥ B (disjoint files) → 3. review + test-runner → docs commit.

## Build choices (record after merge, D-025)
- Playwright is not set up in frontend (no e2e); viewport rules are covered by unit/DOM tests + the manual checklist until U6 adds CI e2e.
