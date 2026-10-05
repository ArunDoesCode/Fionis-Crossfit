import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { OBJECTIVES, PLANS, SEXES } from "../../lib/enums";
import { asExpression, createdAt, inList, moment, updatedAt } from "./helpers";

/** Gym members. Archived = hidden but still editable (BR-REC-58). Rules: members.md */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    /** digits only, '+' dropped (BR-REC-46) */
    phoneDigits: text("phone_digits").notNull(),
    email: text("email"),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    sex: text("sex").notNull(),
    joinedOn: date("joined_on", { mode: "string" }).notNull(),
    objective: text("objective"),
    notes: text("notes"),
    archivedAt: moment("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("members_sex_check", inList(t.sex, SEXES)),
    check("members_objective_check", inList(t.objective, OBJECTIVES)),
    // phone lookup on the last 10 digits (BR-REC-46)
    index("members_phone_last10_idx").on(sql`right(${t.phoneDigits}, 10)`),
    // A-Z list / name search of non-archived members; the expression equals the sort key `nameKey`
    // in repository/membersSql.ts (BR-REC-207)
    index("members_name_active_idx")
      .on(sql`lower(${t.fullName}) collate "C"`, asExpression(t.id))
      .where(sql`${t.archivedAt} is null`),
  ],
);

/**
 * A membership term. Periods are edited, never deleted; the end date is set
 * by the service (BR-REC-51). Overlap is a service check only (BR-REC-09).
 */
export const membershipPeriods = pgTable(
  "membership_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    plan: text("plan").notNull(),
    startOn: date("start_on", { mode: "string" }).notNull(),
    endOn: date("end_on", { mode: "string" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("membership_periods_plan_check", inList(t.plan, PLANS)),
    check("membership_periods_end_check", sql`${t.endOn} >= ${t.startOn}`),
    index("membership_periods_member_start_idx").on(
      t.memberId,
      t.startOn.desc(),
    ),
    index("membership_periods_end_idx").on(t.endOn),
  ],
);
