import type { Context } from "hono";

import { ok, okPaginated, readJsonBody } from "../lib/http";
import type { AppEnv } from "../lib/types";
import { assessmentsService } from "../service/assessmentsService";
import {
  assessmentIdParamsSchema,
  assessmentListQuerySchema,
  entryFormQuerySchema,
  saveAssessmentBodySchema,
  updateAssessmentBodySchema,
} from "../types/assessments.types";
import { memberIdParamsSchema } from "../types/common.types";

type AssessmentsContext = Context<AppEnv>;

// E25-E30. Each handler parses its input with the route's schemas (the guard in front of it
// already refused a bad request; parsing again gives the typed value) and shapes the answer.
export const assessmentsController = {
  /** E25 */
  async entryForm(c: AssessmentsContext) {
    const { memberId } = memberIdParamsSchema.parse(c.req.param());
    const query = entryFormQuerySchema.parse(c.req.query());
    return ok(c, await assessmentsService.entryForm(memberId, query));
  },

  /** E26: 200 whether it created or edited (`created` says which). */
  async save(c: AssessmentsContext) {
    const body = saveAssessmentBodySchema.parse(await readJsonBody(c));
    return ok(
      c,
      await assessmentsService.save(c.get("actor"), body, new Date()),
    );
  },

  /** E27 */
  async list(c: AssessmentsContext) {
    const query = assessmentListQuerySchema.parse(c.req.query());
    const { items, total } = await assessmentsService.list(query);
    return okPaginated(c, items, {
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  },

  /** E28 */
  async get(c: AssessmentsContext) {
    const { assessmentId } = assessmentIdParamsSchema.parse(c.req.param());
    return ok(c, await assessmentsService.get(assessmentId));
  },

  /** E29 */
  async update(c: AssessmentsContext) {
    const { assessmentId } = assessmentIdParamsSchema.parse(c.req.param());
    const body = updateAssessmentBodySchema.parse(await readJsonBody(c));
    return ok(
      c,
      await assessmentsService.update(
        c.get("actor"),
        assessmentId,
        body,
        new Date(),
      ),
    );
  },

  /** E30 */
  async remove(c: AssessmentsContext) {
    const { assessmentId } = assessmentIdParamsSchema.parse(c.req.param());
    return ok(c, await assessmentsService.remove(c.get("actor"), assessmentId));
  },
};
