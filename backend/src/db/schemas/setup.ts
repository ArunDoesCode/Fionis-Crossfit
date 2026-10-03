import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  BETTER_DIRECTIONS,
  DATATYPES,
  INTERVAL_UNITS,
  TABLE_PARTS,
} from "../../lib/enums";
import { asExpression, createdAt, inList, updatedAt } from "./helpers";

/** ONE row of gym settings (BR-REC-168, BR-REC-60). Rules: setup.md */
export const gymSettings = pgTable(
  "gym_settings",
  {
    id: smallint("id").primaryKey().default(1),
    gymName: text("gym_name").notNull().default("Fionis CrossFit"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    upcomingLeadDays: smallint("upcoming_lead_days").notNull().default(7),
    expiryLeadDays: smallint("expiry_lead_days").notNull().default(14),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("gym_settings_single_row_check", sql`${t.id} = 1`),
    check(
      "gym_settings_upcoming_lead_days_check",
      sql`${t.upcomingLeadDays} between 0 and 30`,
    ),
    check(
      "gym_settings_expiry_lead_days_check",
      sql`${t.expiryLeadDays} between 0 and 60`,
    ),
  ],
);

/** An assessment, e.g. Body composition (BR-REC-10, 13). Never deleted, only turned off. */
export const assessmentTypes = pgTable(
  "assessment_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    intervalCount: smallint("interval_count").notNull(),
    intervalUnit: text("interval_unit").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "assessment_types_interval_count_check",
      sql`${t.intervalCount} between 1 and 24`,
    ),
    check(
      "assessment_types_interval_unit_check",
      inList(t.intervalUnit, INTERVAL_UNITS),
    ),
    uniqueIndex("assessment_types_name_lower_key").on(sql`lower(${t.name})`),
  ],
);

/** A measurement inside an assessment, e.g. Weight (BR-REC-10, 14, 65). Never deleted. */
export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    typeId: uuid("type_id")
      .notNull()
      .references(() => assessmentTypes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** label only, max 12 chars (BR-REC-62, 69) */
    unit: text("unit").notNull().default(""),
    datatype: text("datatype").notNull(),
    /** duration values use 0 */
    decimals: smallint("decimals").notNull().default(1),
    /** 'none' = No direction (setup Q1 = A) */
    better: text("better").notNull(),
    plausibleMin: numeric("plausible_min", {
      precision: 12,
      scale: 3,
      mode: "number",
    }),
    plausibleMax: numeric("plausible_max", {
      precision: 12,
      scale: 3,
      mode: "number",
    }),
    /** own repeat interval overriding the type's (BR-REC-14); count + unit: both or neither */
    intervalCount: smallint("interval_count"),
    intervalUnit: text("interval_unit"),
    /** report-table place (BR-REC-65); group + part: both or neither */
    tableGroup: text("table_group"),
    tablePart: text("table_part"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("metrics_datatype_check", inList(t.datatype, DATATYPES)),
    check("metrics_decimals_check", sql`${t.decimals} between 0 and 2`),
    check("metrics_better_check", inList(t.better, BETTER_DIRECTIONS)),
    check(
      "metrics_plausible_range_check",
      sql`${t.plausibleMin} is null or ${t.plausibleMax} is null or ${t.plausibleMin} < ${t.plausibleMax}`,
    ),
    check(
      "metrics_interval_count_check",
      sql`${t.intervalCount} between 1 and 24`,
    ),
    check(
      "metrics_interval_unit_check",
      inList(t.intervalUnit, INTERVAL_UNITS),
    ),
    check(
      "metrics_interval_pair_check",
      sql`(${t.intervalCount} is null) = (${t.intervalUnit} is null)`,
    ),
    check("metrics_table_part_check", inList(t.tablePart, TABLE_PARTS)),
    check(
      "metrics_table_pair_check",
      sql`(${t.tableGroup} is null) = (${t.tablePart} is null)`,
    ),
    uniqueIndex("metrics_type_name_lower_key").on(
      asExpression(t.typeId),
      sql`lower(${t.name})`,
    ),
    index("metrics_type_sort_idx").on(t.typeId, t.sortOrder),
  ],
);
