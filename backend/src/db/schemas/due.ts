import { sql } from "drizzle-orm";
import {
  check,
  date,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { DUE_OVERRIDE_KINDS } from "../../lib/enums";
import { createdAt, inList } from "./helpers";
import { members } from "./members";
import { assessmentTypes } from "./setup";

/** "Assess soon" (flag) or "Remind me later" (snooze) for one member + type (BR-REC-18, 98-100). */
export const dueOverrides = pgTable(
  "due_overrides",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    typeId: uuid("type_id")
      .notNull()
      .references(() => assessmentTypes.id),
    kind: text("kind").notNull(),
    /** gym day it was set (flag clearing, BR-REC-98) */
    setOn: date("set_on", { mode: "string" }).notNull(),
    /** snooze only, at most set_on + 90 days (BR-REC-99) */
    untilOn: date("until_on", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.typeId] }),
    check("due_overrides_kind_check", inList(t.kind, DUE_OVERRIDE_KINDS)),
    check(
      "due_overrides_until_check",
      sql`(${t.kind} = 'snooze') = (${t.untilOn} is not null)`,
    ),
    check(
      "due_overrides_snooze_max_check",
      sql`${t.untilOn} is null or ${t.untilOn} <= ${t.setOn} + 90`,
    ),
  ],
);
