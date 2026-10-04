import { db, type Tx } from "../db/client";
import { diffChangedFields, writeAudit } from "../lib/audit";
import type { Actor } from "../lib/auth-middleware";
import { addDays, type IsoDate } from "../lib/domain/dates";
import { membershipEnd } from "../lib/domain/membership";
import { ConflictError, NotFoundError } from "../lib/errors";
import {
  membershipsRepository,
  type PeriodRow,
} from "../repository/membershipsRepository";
import {
  type MemberRow,
  membersRepository,
} from "../repository/membersRepository";
import type {
  CreatePeriodBody,
  EndingMembershipItem,
  EndingMembershipsQuery,
  Period,
  UpdatePeriodBody,
} from "../types/members.types";
import {
  periodsOverlap,
  RECENTLY_ENDED_DAYS,
  restoresMember,
} from "./membershipsRules";
import { membersService } from "./membersService";
import {
  memberNotFound,
  membershipOf,
  readGymClock,
  startBeforeJoin,
} from "./membersView";

// Membership periods: BR-REC-09, 50, 51, 53, 55, 58. Every function takes `now`.
// E22 and E23 hold the member's row lock before they look at the other periods, so two
// renewals of one member run one after the other and the second sees the first (BR-REC-09).

export type PeriodResult = Period & { memberRestored: boolean };

type Span = Pick<PeriodRow, "startOn" | "endOn">;

function assertNoOverlap(others: PeriodRow[], saved: Span): void {
  if (others.some((other) => periodsOverlap(saved, other))) {
    throw new ConflictError(
      "This membership overlaps another one of this member",
      "PERIOD_OVERLAP",
    );
  }
}

/** BR-REC-58: an archived member whose saved period covers today is restored in the same transaction. */
async function restoreIfCovered(
  tx: Tx,
  actor: Actor,
  member: MemberRow,
  saved: Span,
  today: IsoDate,
): Promise<boolean> {
  if (!restoresMember(member.archivedAt !== null, saved, today)) return false;
  await membersService.restoreInTransaction(tx, actor, member);
  return true;
}

/** The member under its row lock, 404 when unknown. */
async function lockMember(tx: Tx, memberId: string): Promise<MemberRow> {
  const member = await membersRepository.lockById(tx, memberId);
  if (!member) throw memberNotFound();
  return member;
}

export const membershipsService = {
  /**
   * E22. Order of answers: 404, START_BEFORE_JOIN, PERIOD_OVERLAP. A future start is allowed
   * (renewed early). Writes `membership.create` and, when the member came back, `member.restore`.
   */
  async add(
    actor: Actor,
    memberId: string,
    body: CreatePeriodBody,
    now: Date,
  ): Promise<PeriodResult> {
    const clock = await readGymClock(now);
    const { plan, startOn } = body;
    const endOn = membershipEnd(plan, startOn);

    return db.transaction(async (tx) => {
      const member = await lockMember(tx, memberId);
      if (startOn < member.joinedOn) throw startBeforeJoin();
      assertNoOverlap(await membershipsRepository.listForMember(tx, memberId), {
        startOn,
        endOn,
      });

      const period = await membershipsRepository.insert(tx, {
        memberId,
        plan,
        startOn,
        endOn,
      });
      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "membership.create",
        entity: "membership_period",
        entityId: period.id,
        before: null,
        after: { memberId, plan, startOn, endOn },
      });
      const memberRestored = await restoreIfCovered(
        tx,
        actor,
        member,
        period,
        clock.today,
      );
      return { ...period, memberRestored };
    });
  },

  /**
   * E23. The period must belong to the member (404). The end is recalculated from the resulting plan and
   * start; START_BEFORE_JOIN and PERIOD_OVERLAP are checked against the member's OTHER periods. A save
   * that changes nothing writes no `membership.update` row but still applies the restore rule.
   */
  async update(
    actor: Actor,
    memberId: string,
    periodId: string,
    body: UpdatePeriodBody,
    now: Date,
  ): Promise<PeriodResult> {
    const clock = await readGymClock(now);

    return db.transaction(async (tx) => {
      const member = await lockMember(tx, memberId);
      const period = await membershipsRepository.findOfMember(
        tx,
        memberId,
        periodId,
      );
      if (!period) throw new NotFoundError("Membership period not found");

      const plan = body.plan ?? period.plan;
      const startOn = body.startOn ?? period.startOn;
      const saved = { plan, startOn, endOn: membershipEnd(plan, startOn) };
      if (startOn < member.joinedOn) throw startBeforeJoin();
      const periods = await membershipsRepository.listForMember(tx, memberId);
      assertNoOverlap(
        periods.filter((other) => other.id !== periodId),
        saved,
      );

      const diff = diffChangedFields(
        { plan: period.plan, startOn: period.startOn, endOn: period.endOn },
        saved,
      );
      if (diff) {
        await membershipsRepository.update(tx, periodId, saved);
        await writeAudit(tx, {
          sessionId: actor.sessionId,
          action: "membership.update",
          entity: "membership_period",
          entityId: periodId,
          before: diff.before,
          after: diff.after,
        });
      }
      const memberRestored = await restoreIfCovered(
        tx,
        actor,
        member,
        saved,
        clock.today,
      );
      return { id: periodId, ...saved, memberRestored };
    });
  },

  /** E24. Ends soon (soonest first) or ended in the last 30 days (most recent first); archived members never (BR-REC-53). */
  async ending(
    query: EndingMembershipsQuery,
    now: Date,
  ): Promise<{ items: EndingMembershipItem[]; total: number }> {
    const clock = await readGymClock(now);
    const { rows, total } = await membershipsRepository.listEnding({
      status: query.status,
      today: clock.today,
      leadDays: clock.leadDays,
      endedSince: addDays(clock.today, -RECENTLY_ENDED_DAYS),
      page: query.page,
      pageSize: query.pageSize,
    });
    const items = rows.map(
      (row): EndingMembershipItem => ({
        memberId: row.memberId,
        fullName: row.fullName,
        phone: row.phone,
        plan: row.plan,
        endOn: row.endOn,
        daysLeft: membershipOf(row, clock).daysLeft,
      }),
    );
    return { items, total };
  },
};
