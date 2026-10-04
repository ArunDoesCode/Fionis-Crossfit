import type { Context } from "hono";

import { ok, okPaginated, readJsonBody } from "../lib/http";
import type { AppEnv } from "../lib/types";
import { membershipsService } from "../service/membershipsService";
import { memberIdParamsSchema } from "../types/common.types";
import {
  createPeriodBodySchema,
  endingMembershipsQuerySchema,
  periodParamsSchema,
  updatePeriodBodySchema,
} from "../types/members.types";

type MembershipsContext = Context<AppEnv>;

export const membershipsController = {
  /** E22 */
  async add(c: MembershipsContext) {
    const { memberId } = memberIdParamsSchema.parse(c.req.param());
    const body = createPeriodBodySchema.parse(await readJsonBody(c));
    const period = await membershipsService.add(
      c.get("actor"),
      memberId,
      body,
      new Date(),
    );
    return ok(c, period, 201);
  },

  /** E23 */
  async update(c: MembershipsContext) {
    const { memberId, periodId } = periodParamsSchema.parse(c.req.param());
    const body = updatePeriodBodySchema.parse(await readJsonBody(c));
    const period = await membershipsService.update(
      c.get("actor"),
      memberId,
      periodId,
      body,
      new Date(),
    );
    return ok(c, period);
  },

  /** E24 */
  async ending(c: MembershipsContext) {
    const query = endingMembershipsQuerySchema.parse(c.req.query());
    const { items, total } = await membershipsService.ending(query, new Date());
    return okPaginated(c, items, {
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  },
};
