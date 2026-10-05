import { eq, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { assessments, members, membershipPeriods } from "../db/schemas";
import type { IsoDate } from "../lib/domain/dates";
import type { MembershipStatus } from "../lib/enums";

// SQL pieces shared by the member list (E16) and the memberships-ending list (E24).
// The status conditions must give the same answer as `membershipStatus`
// (`lib/domain/membership.ts`) for the latest period by start (BR-REC-52).

/** The member's latest period by start, joined once per member (see `onLatestPeriod`). */
export const latestPeriod = alias(membershipPeriods, "latest_period");

/** The id of the member's latest period by start; a tie on the start day is broken by id so the pick is stable. */
const latestPeriodId = sql`(select ${membershipPeriods.id} from ${membershipPeriods} where ${membershipPeriods.memberId} = ${members.id} order by ${membershipPeriods.startOn} desc, ${membershipPeriods.id} desc limit 1)`;

/** Join condition for `latestPeriod`: one row per member that has a period. */
export const onLatestPeriod = eq(latestPeriod.id, latestPeriodId);

/**
 * Case-insensitive name, the A-Z sort key (BR-REC-56). Compared byte by byte (`C`), so the order is
 * the same on every database whatever its locale ("Surya K" before "Surya Pratap", "Ann Lee" before
 * "Anna Bell"; the locale order ignores spaces). `members_name_active_idx` is built on exactly
 * this expression (`lower(full_name) collate "C"`, id; BR-REC-207), so the A-Z order can be read from it.
 * Change both together or the index stops serving the sort.
 */
export const nameKey = sql`(lower(${members.fullName}) collate "C")`;

/** Latest assessment day of the member, null = never assessed. */
export const lastAssessedOn = sql<
  string | null
>`(select max(${assessments.assessedOn}) from ${assessments} where ${assessments.memberId} = ${members.id})`;

/**
 * The latest period has this membership status on `today` (BR-REC-52):
 * expired = ends before today; expiring = has started and ends within `leadDays`
 * (ending today counts); active = everything else that has not ended, a period
 * that has not started yet included.
 */
export function statusCondition(
  status: MembershipStatus,
  today: IsoDate,
  leadDays: number,
): SQL {
  const day = sql`${today}::date`;
  const daysLeft = sql`(${latestPeriod.endOn} - ${day})`;
  const started = sql`${latestPeriod.startOn} <= ${day}`;
  switch (status) {
    case "expired":
      return sql`${latestPeriod.endOn} < ${day}`;
    case "expiring":
      return sql`(${latestPeriod.endOn} >= ${day} and ${started} and ${daysLeft} <= ${leadDays}::int)`;
    case "active":
      return sql`(${latestPeriod.endOn} >= ${day} and (not ${started} or ${daysLeft} > ${leadDays}::int))`;
  }
}
