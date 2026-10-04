import { db, type Tx } from "../db/client";
import { writeAudit } from "../lib/audit";
import type { Actor } from "../lib/auth-middleware";
import { addDays, gymToday, type IsoDate } from "../lib/domain/dates";
import {
  computeDue,
  type DueAssessmentType,
  type DueMember,
  dueListRows,
  isListedInDueList,
  memberDueItems,
} from "../lib/domain/due";
import { BadRequestError, NotFoundError } from "../lib/errors";
import {
  type CatalogRow,
  type OverrideRow,
  dueRepository as repo,
} from "../repository/dueRepository";
import { membersRepository } from "../repository/membersRepository";
import type {
  DueActionBody,
  DueActionResult,
  DueListItem,
  DueListQuery,
  MemberDueItem,
} from "../types/due.types";
import { memberNotFound } from "./membersView";
import { setupService } from "./setupService";

// Who is due (due-list.md BR-REC-15..18, 93..105, C1..C10). E31 / E32 load the rows with a few queries, hand
// them to the pure functions in `lib/domain/due.ts` and shape the answer. E33 / E34 write `due_overrides`.
// Every function takes `now`; only controllers read the clock.

/** BR-REC-18, 99: a reminder reaches at most this many days past today. */
const MAX_SNOOZE_DAYS = 90;

const typeNotFound = () => new NotFoundError("Assessment not found");

/** The gym's today and the "Due soon" window, read from the settings per request (BR-REC-93, 96). */
async function readDueClock(
  now: Date,
): Promise<{ today: IsoDate; upcomingLeadDays: number }> {
  const settings = await setupService.getSettings();
  return {
    today: gymToday(now, settings.timezone),
    upcomingLeadDays: settings.upcomingLeadDays,
  };
}

/** One row per measurement -> assessments with their measurements (rows arrive in setup order). */
function catalogTypes(rows: readonly CatalogRow[]): DueAssessmentType[] {
  const types = new Map<string, DueAssessmentType>();
  for (const row of rows) {
    let type = types.get(row.typeId);
    if (!type) {
      type = {
        id: row.typeId,
        name: row.typeName,
        isActive: true,
        sortOrder: row.typeSortOrder,
        intervalCount: row.typeIntervalCount,
        intervalUnit: row.typeIntervalUnit,
        measurements: [],
      };
      types.set(row.typeId, type);
    }
    type.measurements.push({
      id: row.metricId,
      name: row.metricName,
      isActive: true,
      sortOrder: row.metricSortOrder,
      intervalCount: row.metricIntervalCount,
      intervalUnit: row.metricIntervalUnit,
    });
  }
  return [...types.values()];
}

const snapshotOf = (override: OverrideRow) => ({
  kind: override.kind,
  setOn: override.setOn,
  untilOn: override.untilOn,
});

/** The change-log key of an override: its table key, member + assessment. */
const overrideKey = (memberId: string, typeId: string) =>
  `${memberId}:${typeId}`;

/** Loads the member and the assessment under the member's row lock; 404 for either (member first, C9). */
async function lockPair(tx: Tx, memberId: string, typeId: string) {
  if (!(await membersRepository.lockById(tx, memberId))) {
    throw memberNotFound();
  }
  if (!(await repo.typeExists(tx, typeId))) throw typeNotFound();
}

export const dueService = {
  /**
   * E31. Archived members and members whose membership has Ended are left out (BR-REC-17, C3); the rows
   * of one tab come from `computeDue` + `dueListRows` (sorted), then the page is cut in memory.
   */
  async list(
    query: DueListQuery,
    now: Date,
  ): Promise<{ items: DueListItem[]; total: number }> {
    const { typeId } = query;
    const [clock, memberRows, catalog, lastMeasured, overrides] =
      await Promise.all([
        readDueClock(now),
        repo.listMembers(db),
        repo.listCatalog(db, typeId),
        repo.listLastMeasured(db, { typeId }),
        repo.listOverrides(db, { typeId }),
      ]);
    const listed: DueMember[] = memberRows
      .filter((member) =>
        isListedInDueList(
          {
            archived: member.archivedAt !== null,
            latestMembership: member.latestMembership,
          },
          clock.today,
        ),
      )
      .map(({ id, fullName, joinedOn }) => ({ id, fullName, joinedOn }));
    const rows = dueListRows(
      computeDue({
        ...clock,
        members: listed,
        types: catalogTypes(catalog),
        lastMeasured,
        overrides,
      }),
      query.status,
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      items: rows.slice(start, start + query.pageSize),
      total: rows.length,
    };
  },

  /** E32. One line per turned-on assessment; answers for every member, archived and Expired too (C3, C10). */
  async memberItems(memberId: string, now: Date): Promise<MemberDueItem[]> {
    const [clock, member, catalog, lastMeasured, overrides] = await Promise.all(
      [
        readDueClock(now),
        membersRepository.findById(memberId),
        repo.listCatalog(db, undefined),
        repo.listLastMeasured(db, { memberId }),
        repo.listOverrides(db, { memberId }),
      ],
    );
    if (!member) throw memberNotFound();
    return memberDueItems(
      computeDue({
        ...clock,
        members: [
          {
            id: member.id,
            fullName: member.fullName,
            joinedOn: member.joinedOn,
          },
        ],
        types: catalogTypes(catalog),
        lastMeasured,
        overrides,
      }),
    );
  },

  /**
   * E33. Under the member's row lock: 404 for the member, then the assessment, then the `until` checks
   * (after today: 400 VALIDATION_ERROR; at most today + 90 days: 400 SNOOZE_TOO_FAR; BR-REC-99, C8).
   * Replaces any earlier Assess soon / Remind me later of that member + assessment (BR-REC-100).
   */
  async setAction(
    actor: Actor,
    memberId: string,
    typeId: string,
    body: DueActionBody,
    now: Date,
  ): Promise<DueActionResult> {
    const { today } = await readDueClock(now);
    return db.transaction(async (tx) => {
      await lockPair(tx, memberId, typeId);
      const untilOn = body.action === "snooze" ? body.until : null;
      if (untilOn !== null) {
        if (untilOn <= today) {
          throw new BadRequestError(
            "Pick a day after today",
            "VALIDATION_ERROR",
            {
              field: "until",
              issues: [{ path: "until", message: "Pick a day after today" }],
            },
          );
        }
        if (untilOn > addDays(today, MAX_SNOOZE_DAYS)) {
          throw new BadRequestError(
            "A reminder can be at most 90 days ahead",
            "SNOOZE_TOO_FAR",
          );
        }
      }
      const before = await repo.findOverride(tx, memberId, typeId);
      const saved = await repo.upsertOverride(tx, {
        memberId,
        typeId,
        kind: body.action,
        setOn: today,
        untilOn,
        createdAt: now,
      });
      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "due_override.set",
        entity: "due_override",
        entityId: overrideKey(memberId, typeId),
        before: before ? snapshotOf(before) : null,
        after: snapshotOf(saved),
      });
      return { kind: saved.kind, setOn: saved.setOn, untilOn: saved.untilOn };
    });
  },

  /** E34. Deletes the override; with nothing set it is still a success and still logged (C9). */
  async clearAction(
    actor: Actor,
    memberId: string,
    typeId: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await lockPair(tx, memberId, typeId);
      const removed = await repo.deleteOverride(tx, memberId, typeId);
      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "due_override.clear",
        entity: "due_override",
        entityId: overrideKey(memberId, typeId),
        before: removed ? snapshotOf(removed) : null,
        after: null,
      });
    });
  },
};
