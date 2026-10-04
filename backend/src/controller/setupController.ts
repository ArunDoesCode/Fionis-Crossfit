import type { Context } from "hono";

import { ok, okPaginated, readJsonBody } from "../lib/http";
import type { AppEnv } from "../lib/types";
import { setupService } from "../service/setupService";
import {
  assessmentTypeListQuerySchema,
  assessmentTypeOrderBodySchema,
  createAssessmentTypeBodySchema,
  createMetricBodySchema,
  metricIdParamsSchema,
  metricOrderBodySchema,
  typeIdParamsSchema,
  updateAssessmentTypeBodySchema,
  updateMetricBodySchema,
  updateSettingsBodySchema,
} from "../types/setup.types";

type SetupContext = Context<AppEnv>;

// E07-E15. Each handler parses its input with the route's schemas (the guard in front of it
// already refused a bad request; parsing again gives the typed, trimmed value) and shapes the answer.
export const setupController = {
  /** E07 */
  async getSettings(c: SetupContext) {
    return ok(c, await setupService.getSettings());
  },

  /** E08 */
  async updateSettings(c: SetupContext) {
    const body = updateSettingsBodySchema.parse(await readJsonBody(c));
    return ok(c, await setupService.updateSettings(c.get("actor"), body));
  },

  /** E09 */
  async listCatalog(c: SetupContext) {
    const query = assessmentTypeListQuerySchema.parse(c.req.query());
    const { items, total } = await setupService.listCatalog(query);
    return okPaginated(c, items, {
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  },

  /** E10 */
  async createType(c: SetupContext) {
    const body = createAssessmentTypeBodySchema.parse(await readJsonBody(c));
    return ok(c, await setupService.createType(c.get("actor"), body), 201);
  },

  /** E11 */
  async updateType(c: SetupContext) {
    const { typeId } = typeIdParamsSchema.parse(c.req.param());
    const body = updateAssessmentTypeBodySchema.parse(await readJsonBody(c));
    return ok(c, await setupService.updateType(c.get("actor"), typeId, body));
  },

  /** E12 */
  async reorderTypes(c: SetupContext) {
    const { typeIds } = assessmentTypeOrderBodySchema.parse(
      await readJsonBody(c),
    );
    await setupService.reorderTypes(c.get("actor"), typeIds);
    return ok(c, {});
  },

  /** E13 */
  async createMetric(c: SetupContext) {
    const { typeId } = typeIdParamsSchema.parse(c.req.param());
    const body = createMetricBodySchema.parse(await readJsonBody(c));
    return ok(
      c,
      await setupService.createMetric(c.get("actor"), typeId, body),
      201,
    );
  },

  /** E14 */
  async updateMetric(c: SetupContext) {
    const { metricId } = metricIdParamsSchema.parse(c.req.param());
    const body = updateMetricBodySchema.parse(await readJsonBody(c));
    return ok(
      c,
      await setupService.updateMetric(c.get("actor"), metricId, body),
    );
  },

  /** E15 */
  async reorderMetrics(c: SetupContext) {
    const { typeId } = typeIdParamsSchema.parse(c.req.param());
    const { metricIds } = metricOrderBodySchema.parse(await readJsonBody(c));
    await setupService.reorderMetrics(c.get("actor"), typeId, metricIds);
    return ok(c, {});
  },
};
