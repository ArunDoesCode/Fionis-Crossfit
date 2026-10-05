# Plan — member-records ux v2, slice U2 (form primitives + modals + empty Save)
Spec: ux.md v5 (frozen) BR-REC-187–190, 195–199 (dates 191–194 = U3; Record assessment grid 188 layout = U4). Issues #45, #47, #48, #49, #52, #53. Frontend only. Same working branch.
Owner's form format (D-034/D-036): FormField → FormItem `min-h-19` → FormControl + FloatingLabelInput → FormMessage; built on shadcn Field/FieldError + RHF Controller; Time field = one FormItem, one label; chips/switch/checkbox same FormItem.

## Slices (order)
- [ ] **A primitives** — `components/common/form/` : FormField, FormItem, FormControl, FormMessage, FloatingLabelInput, FormGrid (container-query 1/2/3/4), FormSection, NumberInput, DurationInput (one FormItem, one label), FormErrorSummary, `useFocusFirstProblem` (replaces the 3 copies; reduced motion), one number parser, zod text→number pipes; Zod messages. Includes #45 root "Enter at least one value" alert primitive support.
- [ ] **B-1 migrate members/auth forms** (parallel after A): Add/Edit member (2-col grid), Renew/Edit membership, Login, ChangePassword; "nothing changed → close silently" (BR-REC-190); no Reset; Enter saves; leave guard (#49).
- [ ] **B-2 migrate setup forms** (parallel after A): Gym settings, Assessment sheet, Measurement sheet → zodResolver (delete schemaResolver + setup/form.ts parser), toast out of component, 2-col.
- [ ] **B-3 Record assessment → RHF + Zod** (parallel after A) incl. #45: top alert, focus first field, re-announce each click; drafts via watch, leave guard via isDirty; real submit (Enter saves). Grid layout itself is U4.
- [ ] **C modals** (parallel from the start, disjoint files): ResponsiveSheet phone branch on shadcn `ui/drawer`, ConfirmSheet reused by LeaveDialog (`cancelLabel`, `backToClose`), time-zone Select → searchable Combobox, `<details>` → Collapsible (#52, #53).
- [ ] **D verify** — reviewer + test-runner, fix loop ≤ 2.

## File ownership
A: `components/common/form/**`, `lib/forms/**`, `lib/validators/**` (shared parts). B-1: `components/pages/{members,auth}/**` forms, `lib/validators/{members,auth}.ts`. B-2: `components/pages/setup/**`, `lib/setup/**`, `lib/validators/setup.ts`. B-3: `components/pages/assessments/**`, `lib/assessments/**`. C: `components/common/{ResponsiveSheet,ConfirmSheet}.tsx`, `components/ui/{drawer,command,popover,collapsible}` (CLI), setup FormControls tz select (coordinate with B-2: C owns only the Combobox component file).
