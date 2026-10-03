import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./helpers";
import { members } from "./members";
import { assessmentTypes, metrics } from "./setup";

/** One assessment = member + type + date (BR-REC-19). Deleted with its values (BR-REC-165). */
export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    typeId: uuid("type_id")
      .notNull()
      .references(() => assessmentTypes.id, { onDelete: "restrict" }),
    assessedOn: date("assessed_on", { mode: "string" }).notNull(),
    isEstimated: boolean("is_estimated").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("assessments_member_type_date_key").on(
      t.memberId,
      t.typeId,
      t.assessedOn,
    ),
    index("assessments_member_date_idx").on(t.memberId, t.assessedOn.desc()),
  ],
);

/**
 * One value of one measurement. `member_id` and `measured_on` copy the
 * assessment's member and date in the same transaction (BR-REC-166).
 * `value`: durations in whole seconds, weights in kg (BR-REC-164).
 */
export const measurements = pgTable(
  "measurements",
  {
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => metrics.id, { onDelete: "restrict" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    measuredOn: date("measured_on", { mode: "string" }).notNull(),
    value: numeric("value", {
      precision: 12,
      scale: 3,
      mode: "number",
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.assessmentId, t.metricId] }),
    // member maths (first / latest / best / previous) and gym progress
    index("measurements_member_metric_date_idx").on(
      t.memberId,
      t.metricId,
      t.measuredOn.desc(),
    ),
    index("measurements_metric_date_idx").on(t.metricId, t.measuredOn),
  ],
);
