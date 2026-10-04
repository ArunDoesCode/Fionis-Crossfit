import { db } from "../db/client";
import { writeAudit } from "../lib/audit";
import type { Actor } from "../lib/auth-middleware";
import { gymToday, type IsoDate } from "../lib/domain/dates";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import {
  type AssessmentFacts,
  assessmentsRepository as repo,
  type StoredValue,
} from "../repository/assessmentsRepository";
import type {
  AssessmentDetail,
  AssessmentListItem,
  AssessmentListQuery,
  EntryForm,
  EntryFormQuery,
  SaveAssessmentBody,
  SaveAssessmentResult,
  UpdateAssessmentBody,
} from "../types/assessments.types";
import {
  assessmentSnapshot,
  hasForeignMetric,
  leavesNoValues,
  listedMetrics,
  type MetricKind,
  planSave,
  type RuleIssue,
  roundEntries,
  type ValueMap,
  valueIssues,
} from "./assessmentsRules";

// Recording assessments: docs/specs/member-records/assessments.md (BR-REC-12, 19, 20, 74, 76-78, 81,
// 83, 86-89, 92; D1-D10, D20). Every function takes `now`; only controllers read the clock. Every
// write (E26, E29, E30) is one transaction that locks the member row first (D6) and also writes its
// change-log row (BR-REC-158).

const notFound = (what: "Member" | "Assessment type" | "Assessment") =>
  new NotFoundError(`${what} not found`);

/** BR-REC-83: `field` tells the form which field to mark. */
const dateInFuture = () =>
  new BadRequestError("The date can't be in the future", "DATE_IN_FUTURE", {
    field: "date",
  });

const metricNotInType = () =>
  new BadRequestError(
    "A measurement does not belong to this assessment",
    "METRIC_NOT_IN_TYPE",
  );

const noValues = () =>
  new BadRequestError("Enter at least one value", "NO_VALUES");

const invalid = (issues: RuleIssue[]) =>
  new BadRequestError("Validation failed", "VALIDATION_ERROR", { issues });

const dateTaken = () =>
  new ConflictError(
    "This member already has this assessment on that date",
    "ASSESSMENT_DATE_TAKEN",
  );

const valueMapOf = (values: readonly StoredValue[]): ValueMap =>
  Object.fromEntries(values.map(({ metricId, value }) => [metricId, value]));

const detailOf = (
  assessment: AssessmentFacts,
  values: readonly StoredValue[],
): AssessmentDetail => ({
  id: assessment.id,
  memberId: assessment.memberId,
  typeId: assessment.typeId,
  typeName: assessment.typeName,
  date: assessment.date,
  isEstimated: assessment.isEstimated,
  values: values.map(({ metricId, name, unit, datatype, value }) => ({
    metricId,
    name,
    unit,
    datatype,
    value,
  })),
});

export const assessmentsService = {
  /**
   * E25. `existing` = this member's assessment of this type on exactly `date`; `previous` per
   * measurement = the latest value dated strictly before `date` (BR-REC-20, 74, 81, D5). Only the
   * date's shape is checked: a future date just returns a form (D1). One round of parallel reads.
   */
  async entryForm(memberId: string, query: EntryFormQuery): Promise<EntryForm> {
    const [member, type, metricRows, stored, previous] = await Promise.all([
      repo.findMember(db, memberId),
      repo.findType(db, query.typeId),
      repo.listMetrics(db, query.typeId),
      repo.findStored(db, memberId, query.typeId, query.date),
      repo.previousValues(db, memberId, query.typeId, query.date),
    ]);
    if (!member) throw notFound("Member");
    if (!type) throw notFound("Assessment type");

    const previousOf = new Map(previous.map((row) => [row.metricId, row]));
    return {
      member: {
        id: member.id,
        fullName: member.fullName,
        joinedOn: member.joinedOn,
      },
      type: { id: type.id, name: type.name },
      existing: stored
        ? {
            assessmentId: stored.id,
            isEstimated: stored.isEstimated,
            values: stored.values,
          }
        : null,
      metrics: listedMetrics(
        metricRows,
        type.isActive,
        stored?.values ?? {},
      ).map((metric) => {
        const before = previousOf.get(metric.id);
        return {
          id: metric.id,
          name: metric.name,
          unit: metric.unit,
          datatype: metric.datatype,
          decimals: metric.decimals,
          better: metric.better,
          plausibleMin: metric.plausibleMin,
          plausibleMax: metric.plausibleMax,
          previous: before
            ? {
                value: before.value,
                on: before.on,
                isEstimated: before.isEstimated,
              }
            : null,
        };
      }),
    };
  },

  /**
   * E26. Under the member's row lock, refusals come in this order: unknown member or assessment
   * (404), a date after the gym's today (DATE_IN_FUTURE), a measurement of another assessment
   * (METRIC_NOT_IN_TYPE), a Time or rounded Number limit (VALIDATION_ERROR), a save that would leave
   * no stored value at all (NO_VALUES, D2). A refusal writes nothing, `isEstimated` included. A save
   * of the same member + type + date again edits the one assessment (BR-REC-19, 86). Only the
   * entries sent are written, so an untouched stored value is never re-rounded (D2); an edit with
   * `values: []` changes only `isEstimated` and still writes its one change-log row.
   */
  async save(
    actor: Actor,
    body: SaveAssessmentBody,
    now: Date,
  ): Promise<SaveAssessmentResult> {
    return db.transaction(async (tx) => {
      const member = await repo.lockMember(tx, body.memberId);
      if (!member) throw notFound("Member");
      const [type, metricRows, timezone, stored] = await Promise.all([
        repo.findType(tx, body.typeId),
        repo.listMetrics(tx, body.typeId),
        repo.readTimezone(tx),
        repo.findStored(tx, member.id, body.typeId, body.date),
      ]);
      if (!type) throw notFound("Assessment type");
      if (body.date > gymToday(now, timezone)) throw dateInFuture();

      const kinds = new Map<string, MetricKind>(
        metricRows.map((metric) => [metric.id, metric]),
      );
      const sent = body.values.map(({ metricId, value }) => ({
        metricId: metricId.toLowerCase(),
        value,
      }));
      if (hasForeignMetric(sent, kinds)) throw metricNotInType();
      const issues = valueIssues(sent, kinds);
      if (issues.length > 0) throw invalid(issues);

      const plan = planSave(stored?.values ?? {}, roundEntries(sent, kinds));
      if (leavesNoValues(plan)) throw noValues();
      let assessmentId: string;
      if (stored) {
        assessmentId = stored.id;
        await repo.updateAssessment(tx, assessmentId, {
          isEstimated: body.isEstimated,
        });
      } else {
        ({ id: assessmentId } = await repo.insertAssessment(tx, {
          memberId: member.id,
          typeId: type.id,
          assessedOn: body.date,
          isEstimated: body.isEstimated,
        }));
      }
      await repo.upsertValues(
        tx,
        { assessmentId, memberId: member.id, date: body.date },
        plan.writes,
      );
      await repo.deleteValues(tx, assessmentId, plan.removals);

      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "assessment.save",
        entity: "assessment",
        entityId: assessmentId,
        before: stored
          ? assessmentSnapshot(body.date, stored.isEstimated, stored.values)
          : null,
        after: assessmentSnapshot(body.date, body.isEstimated, plan.after),
      });
      return {
        assessmentId,
        created: stored === undefined,
        saved: plan.saved,
        removed: plan.removed,
      };
    });
  },

  /**
   * E27. Newest first by default; same-date rows by id. A member with nothing, or an unknown member
   * or assessment, gives an empty list (D10).
   */
  async list(
    query: AssessmentListQuery,
  ): Promise<{ items: AssessmentListItem[]; total: number }> {
    const { rows, total } = await repo.listAssessments(db, {
      memberId: query.memberId,
      typeId: query.typeId,
      sortDir: query.sortDir,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return { items: rows, total };
  },

  /** E28. Every stored value, on or off measurements, in setup order (D9). */
  async get(assessmentId: string): Promise<AssessmentDetail> {
    const [assessment, values] = await Promise.all([
      repo.findAssessment(db, assessmentId),
      repo.listValues(db, assessmentId),
    ]);
    if (!assessment) throw notFound("Assessment");
    return detailOf(assessment, values);
  },

  /**
   * E29. Under the member's row lock: 404, then DATE_IN_FUTURE for a sent date, then
   * ASSESSMENT_DATE_TAKEN when another assessment of this member + type holds the new date (the
   * date it already has is not taken). A new date moves every value's `measured_on` in the same
   * transaction (BR-REC-87, 166, D8). Every successful call writes one `assessment.move` row.
   */
  async update(
    actor: Actor,
    assessmentId: string,
    body: UpdateAssessmentBody,
    now: Date,
  ): Promise<AssessmentDetail> {
    return db.transaction(async (tx) => {
      const memberId = await repo.memberIdOf(tx, assessmentId);
      if (memberId === undefined) throw notFound("Assessment");
      await repo.lockMember(tx, memberId);
      const [stored, values, timezone] = await Promise.all([
        repo.findAssessment(tx, assessmentId),
        repo.listValues(tx, assessmentId),
        repo.readTimezone(tx),
      ]);
      if (!stored) throw notFound("Assessment");

      const date: IsoDate = body.date ?? stored.date;
      const isEstimated = body.isEstimated ?? stored.isEstimated;
      const moved = date !== stored.date;
      if (body.date !== undefined && body.date > gymToday(now, timezone)) {
        throw dateInFuture();
      }
      if (
        moved &&
        (await repo.dateTaken(tx, memberId, stored.typeId, date, assessmentId))
      ) {
        throw dateTaken();
      }

      await repo.updateAssessment(tx, assessmentId, {
        assessedOn: date,
        isEstimated,
      });
      if (moved) await repo.moveValues(tx, assessmentId, date);

      const held = valueMapOf(values);
      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "assessment.move",
        entity: "assessment",
        entityId: assessmentId,
        before: assessmentSnapshot(stored.date, stored.isEstimated, held),
        after: assessmentSnapshot(date, isEstimated, held),
      });
      return detailOf({ ...stored, date, isEstimated }, values);
    });
  },

  /** E30. The assessment and its values go (BR-REC-165); `removed` = how many values. */
  async remove(
    actor: Actor,
    assessmentId: string,
  ): Promise<{ removed: number }> {
    return db.transaction(async (tx) => {
      const memberId = await repo.memberIdOf(tx, assessmentId);
      if (memberId === undefined) throw notFound("Assessment");
      await repo.lockMember(tx, memberId);
      const [stored, values] = await Promise.all([
        repo.findAssessment(tx, assessmentId),
        repo.listValues(tx, assessmentId),
      ]);
      if (!stored) throw notFound("Assessment");

      await repo.deleteAssessment(tx, assessmentId);
      await writeAudit(tx, {
        sessionId: actor.sessionId,
        action: "assessment.delete",
        entity: "assessment",
        entityId: assessmentId,
        before: assessmentSnapshot(
          stored.date,
          stored.isEstimated,
          valueMapOf(values),
        ),
        after: null,
      });
      return { removed: values.length };
    });
  },
};
