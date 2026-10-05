---
name: design
description: >
  DESIGN step for admin screens (D-039), between /spec and /freeze: the ux-designer agent looks at the real
  admin on the isolated ui-audit copy and makes one recommended design per new or changed screen as
  mock-ups (desktop + phone, light + dark) against docs/standards/design.md; the owner picks; the chosen
  screens and words go into the spec. Use when: /design <module>, "design the screens", "how should this
  look", "mock-up", a new feature with admin screens, a screen the owner calls bland or confusing.
---

# /design <module>

1. **Gate.** `docs/specs/<module>.md` exists (draft is fine; frozen → this is a change request, see `/freeze`).
   No admin screen in the spec → say so and stop (TV and member app have their own rules).
2. **Run folder.** `.pipeline/<module>/` (create if missing). The feature id is `<module>` unless the user names one.
3. **Delegate** to the **ux-designer** agent (`subagent_type: ux-designer`) with the PROTOCOL brief:
   module, spec path + version, the screens to design (new + changed), the user's notes verbatim, and the
   output path `.pipeline/<module>/design.md`. Several unrelated screen groups → one ux-designer per group in
   parallel (each its own `--tag` and section file), then merge the sections.
4. **Show the owner** (one screen, plain words): per screen the mock-up PNGs (send the key ones with
   SendUserFile), the main action, the tap count, and the ≤ 3 questions with a recommendation each.
   Offer to publish `design.md` + shots as an artifact page if the owner wants to share it.
5. **Fold the answers in.** Chosen layout, words and states go into the spec's screen section (wireframe,
   word list, examples); new behaviour becomes BR rows via `/spec <module>` (spec-analyst) — never invent
   BR numbers here. Copy the 2–6 key PNGs to `docs/design/<module>/`. Commit
   `docs(<module>): design — <screens>`.
6. **Next:** `/freeze <module>`, then `/feature <module>`; its verify step runs **visual-qa** against
   `.pipeline/<module>/design.md`.

Never write production code or tests in this skill.
