import { ageOn, gymToday, type IsoDate } from "../lib/domain/dates";
import { membershipStatus } from "../lib/domain/membership";
import type { MembershipStatus } from "../lib/enums";
import { AppError, BadRequestError, NotFoundError } from "../lib/errors";
import type { PeriodRow } from "../repository/membershipsRepository";
import {
  type MemberRow,
  membersRepository,
} from "../repository/membersRepository";
import type { MemberDetail } from "../types/members.types";

// What the members services share: the gym's clock, the membership summary, the
// member as E18 shows it, and the errors both services answer.

/** The gym's today and the expiry lead days (BR-REC-08, 52), read from the settings row per request. */
export type GymClock = { today: IsoDate; leadDays: number };

export async function readGymClock(now: Date): Promise<GymClock> {
  const settings = await membersRepository.readGymSettings();
  return {
    today: gymToday(now, settings.timezone),
    leadDays: settings.expiryLeadDays,
  };
}

/** A row the service must find after its own write is missing: a bug, answered as a generic 500. */
export const invariantBroken = () =>
  new AppError("Internal server error", 500, "INTERNAL_ERROR");

export const memberNotFound = () => new NotFoundError("Member not found");

/** BR-REC-50 (E17, E22, E23: the start date; E19: the join date). */
export const startBeforeJoin = () =>
  new BadRequestError(
    "A membership can't start before the join date",
    "START_BEFORE_JOIN",
  );

/** BR-REC-48: `field` tells the form which date to mark. */
export function assertNotInFuture(
  today: IsoDate,
  day: IsoDate,
  field: "dateOfBirth" | "joinedOn",
): void {
  if (day <= today) return;
  throw new BadRequestError(
    field === "dateOfBirth"
      ? "Date of birth can't be in the future"
      : "Join date can't be in the future",
    "DATE_IN_FUTURE",
    { field },
  );
}

/** Status and days left of a latest period on the gym's today; only ever through the domain function (BR-REC-52). */
export function membershipOf(
  latest: Pick<PeriodRow, "startOn" | "endOn">,
  clock: GymClock,
): { status: MembershipStatus; daysLeft: number } {
  const summary = membershipStatus(latest, clock.today, clock.leadDays);
  if (!summary) throw invariantBroken();
  return summary;
}

/** The member as E18 shows it; `periods` newest first, the first one is the latest (BR-REC-52, 59). */
export function toMemberDetail(
  member: MemberRow,
  periods: PeriodRow[],
  clock: GymClock,
): MemberDetail {
  const latest = periods[0];
  if (!latest) throw invariantBroken();
  const { status, daysLeft } = membershipOf(latest, clock);
  return {
    id: member.id,
    fullName: member.fullName,
    phone: member.phone,
    email: member.email,
    dateOfBirth: member.dateOfBirth,
    age: ageOn(member.dateOfBirth, clock.today),
    sex: member.sex,
    joinedOn: member.joinedOn,
    objective: member.objective,
    notes: member.notes,
    archivedAt: member.archivedAt?.toISOString() ?? null,
    membership: {
      status,
      plan: latest.plan,
      startOn: latest.startOn,
      endOn: latest.endOn,
      daysLeft,
    },
    periods: periods.map(({ id, plan, startOn, endOn }) => ({
      id,
      plan,
      startOn,
      endOn,
    })),
  };
}
