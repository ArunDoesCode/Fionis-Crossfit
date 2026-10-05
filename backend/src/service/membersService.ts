import { db, type Tx } from "../db/client";
import { diffChangedFields, writeAudit } from "../lib/audit";
import type { Actor } from "../lib/auth-middleware";
import { membershipEnd } from "../lib/domain/membership";
import { membershipsRepository } from "../repository/membershipsRepository";
import {
  type MemberChanges,
  type MemberRow,
  membersRepository,
} from "../repository/membersRepository";
import {
  type CreateMemberBody,
  cleanPhone,
  type MemberDetail,
  type MemberListItem,
  type MemberListQuery,
  phoneDigits,
  type UpdateMemberBody,
} from "../types/members.types";
import {
  assertNotInFuture,
  memberNotFound,
  membershipOf,
  readGymClock,
  startBeforeJoin,
  toMemberDetail,
} from "./membersView";

// Members: BR-REC-03..07, 45..50, 56..58, 172. Every function takes `now`; only controllers read the clock.
// Every write is one transaction with its change-log rows (BR-REC-158).

/** The fields E19 can change and `member.create` logs, under their API names. */
const MEMBER_FIELDS = [
  "fullName",
  "phone",
  "email",
  "dateOfBirth",
  "sex",
  "joinedOn",
  "objective",
  "notes",
] as const;

type MemberField = (typeof MEMBER_FIELDS)[number];

const snapshotOf = (member: MemberRow): Record<MemberField, string | null> => ({
  fullName: member.fullName,
  phone: member.phone,
  email: member.email,
  dateOfBirth: member.dateOfBirth,
  sex: member.sex,
  joinedOn: member.joinedOn,
  objective: member.objective,
  notes: member.notes,
});

/** Digits of a search text that looks like part of a phone number: spaces, dashes, brackets and `+` dropped, digits only (BR-REC-07). */
function phoneDigitsOfText(text: string): string | undefined {
  const digits = cleanPhone(text).replaceAll("+", "");
  return /^\d+$/.test(digits) ? digits : undefined;
}

/** `archivedAt` and its audit rows are the only thing E20, E21 and the auto-restore change on a member. */
async function setArchivedAt(
  tx: Tx,
  actor: Actor,
  member: MemberRow,
  archivedAt: Date | null,
): Promise<MemberRow> {
  const updated = await membersRepository.update(tx, member.id, { archivedAt });
  await writeAudit(tx, {
    sessionId: actor.sessionId,
    action: archivedAt === null ? "member.restore" : "member.archive",
    entity: "member",
    entityId: member.id,
    before: { archivedAt: member.archivedAt?.toISOString() ?? null },
    after: { archivedAt: archivedAt?.toISOString() ?? null },
  });
  return updated;
}

/** Loads the member under its row lock (404 when unknown) and its periods, newest first. */
async function lockWithPeriods(tx: Tx, memberId: string) {
  const member = await membersRepository.lockById(tx, memberId);
  if (!member) throw memberNotFound();
  const periods = await membershipsRepository.listForMember(tx, memberId);
  return { member, periods };
}

async function changeArchive(
  actor: Actor,
  memberId: string,
  now: Date,
  archive: boolean,
): Promise<MemberDetail> {
  const clock = await readGymClock(now);
  return db.transaction(async (tx) => {
    const { member, periods } = await lockWithPeriods(tx, memberId);
    // already in the wanted state: 200, nothing changes, no change-log row
    const unchanged = (member.archivedAt !== null) === archive;
    const saved = unchanged
      ? member
      : await setArchivedAt(tx, actor, member, archive ? now : null);
    return toMemberDetail(saved, periods, clock);
  });
}

export const membersService = {
  /**
   * E16. Search text, phone lookup and status chip combine with AND (BR-REC-06, 07, 46, 47, 52, 56, 57).
   * Each item's membership comes from the latest period through `membershipStatus`.
   */
  async list(
    query: MemberListQuery,
    now: Date,
  ): Promise<{ items: MemberListItem[]; total: number }> {
    const clock = await readGymClock(now);
    const { rows, total } = await membersRepository.list({
      status: query.status,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      page: query.page,
      pageSize: query.pageSize,
      text: query.q,
      textDigits:
        query.q === undefined ? undefined : phoneDigitsOfText(query.q),
      phoneLast10:
        query.phone === undefined
          ? undefined
          : phoneDigits(query.phone).slice(-10),
      today: clock.today,
      leadDays: clock.leadDays,
    });
    const items = rows.map((row): MemberListItem => {
      const { status, daysLeft } = membershipOf(row, clock);
      return {
        id: row.id,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        lastAssessedOn: row.lastAssessedOn,
        archivedAt: row.archivedAt?.toISOString() ?? null,
        membership: { status, plan: row.plan, endOn: row.endOn, daysLeft },
      };
    });
    return { items, total };
  },

  /**
   * E17. Member and first period in one transaction with `member.create` and `membership.create`.
   * Order of refusals: date of birth in the future, join date in the future, start before the join date.
   */
  async create(
    actor: Actor,
    body: CreateMemberBody,
    now: Date,
  ): Promise<MemberDetail> {
    const clock = await readGymClock(now);
    assertNotInFuture(clock.today, body.dateOfBirth, "dateOfBirth");
    assertNotInFuture(clock.today, body.joinedOn, "joinedOn");
    const { plan, startOn } = body.firstPeriod;
    if (startOn < body.joinedOn) throw startBeforeJoin();
    const endOn = membershipEnd(plan, startOn);

    return db.transaction(async (tx) => {
      const member = await membersRepository.insert(tx, {
        fullName: body.fullName,
        phone: body.phone,
        phoneDigits: phoneDigits(body.phone),
        email: body.email ?? null,
        dateOfBirth: body.dateOfBirth,
        sex: body.sex,
        joinedOn: body.joinedOn,
        objective: body.objective ?? null,
        notes: body.notes ?? null,
      });
      const period = await membershipsRepository.insert(tx, {
        memberId: member.id,
        plan,
        startOn,
        endOn,
      });
      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "member.create",
        entity: "member",
        entityId: member.id,
        before: null,
        after: snapshotOf(member),
      });
      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "membership.create",
        entity: "membership_period",
        entityId: period.id,
        before: null,
        after: { memberId: member.id, plan, startOn, endOn },
      });
      return toMemberDetail(member, [period], clock);
    });
  },

  /** E18. Archived members are returned like any other. */
  async get(memberId: string, now: Date): Promise<MemberDetail> {
    const [clock, member, periods] = await Promise.all([
      readGymClock(now),
      membersRepository.findById(memberId),
      membershipsRepository.listForMember(db, memberId),
    ]);
    if (!member) throw memberNotFound();
    return toMemberDetail(member, periods, clock);
  },

  /**
   * E19. Works on archived members and never touches `archivedAt`. Under the member's row lock:
   * 404, then the future-date check for a sent date, then START_BEFORE_JOIN for a CHANGED join date
   * (a form that sends every field must still save a member whose data predates the check).
   * Writes and logs only what changed; a request that changes nothing is a 200 without a row.
   */
  async update(
    actor: Actor,
    memberId: string,
    body: UpdateMemberBody,
    now: Date,
  ): Promise<MemberDetail> {
    const clock = await readGymClock(now);
    return db.transaction(async (tx) => {
      const { member, periods } = await lockWithPeriods(tx, memberId);
      if (body.dateOfBirth !== undefined) {
        assertNotInFuture(clock.today, body.dateOfBirth, "dateOfBirth");
      }
      if (body.joinedOn !== undefined) {
        assertNotInFuture(clock.today, body.joinedOn, "joinedOn");
        const joinedOn = body.joinedOn;
        if (
          joinedOn !== member.joinedOn &&
          periods.some((period) => period.startOn < joinedOn)
        ) {
          throw startBeforeJoin();
        }
      }

      const current = snapshotOf(member);
      const sent = MEMBER_FIELDS.filter((field) => body[field] !== undefined);
      const diff = diffChangedFields(
        Object.fromEntries(sent.map((field) => [field, current[field]])),
        body,
      );
      if (!diff) return toMemberDetail(member, periods, clock);

      const changes: MemberChanges = {
        ...body,
        ...(body.phone === undefined
          ? {}
          : { phoneDigits: phoneDigits(body.phone) }),
      };
      const saved = await membersRepository.update(tx, memberId, changes);
      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "member.update",
        entity: "member",
        entityId: memberId,
        before: diff.before,
        after: diff.after,
      });
      return toMemberDetail(saved, periods, clock);
    });
  },

  /** E20. Already archived: 200, the first `archivedAt` is kept, no row. */
  archive(actor: Actor, memberId: string, now: Date): Promise<MemberDetail> {
    return changeArchive(actor, memberId, now, true);
  },

  /** E21. Not archived: 200, no row. Always works, whatever the membership says (BR-REC-58). */
  restore(actor: Actor, memberId: string, now: Date): Promise<MemberDetail> {
    return changeArchive(actor, memberId, now, false);
  },

  /**
   * Brings an archived member back inside the caller's transaction (E22, E23: the saved period
   * covers today, BR-REC-58); logs `member.restore`.
   */
  restoreInTransaction(
    tx: Tx,
    actor: Actor,
    member: MemberRow,
  ): Promise<MemberRow> {
    return setArchivedAt(tx, actor, member, null);
  },
};
