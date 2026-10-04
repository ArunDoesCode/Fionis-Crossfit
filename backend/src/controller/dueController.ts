import type { Context } from "hono";

import { ok, okPaginated, readJsonBody } from "../lib/http";
import type { AppEnv } from "../lib/types";
import { dueService } from "../service/dueService";
import { memberIdParamsSchema } from "../types/common.types";
import {
  dueActionBodySchema,
  dueActionParamsSchema,
  dueListQuerySchema,
} from "../types/due.types";

type DueContext = Context<AppEnv>;

// E31-E34. Each handler parses its input with the route's schemas (the guard in front of it already
// refused a bad request; parsing again gives the typed value) and shapes the answer.
export const dueController = {
  /** E31 */
  async list(c: DueContext) {
    const query = dueListQuerySchema.parse(c.req.query());
    const { items, total } = await dueService.list(query, new Date());
    return okPaginated(c, items, {
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  },

  /** E32 */
  async memberItems(c: DueContext) {
    const { memberId } = memberIdParamsSchema.parse(c.req.param());
    return ok(c, await dueService.memberItems(memberId, new Date()));
  },

  /** E33 */
  async setAction(c: DueContext) {
    const { memberId, typeId } = dueActionParamsSchema.parse(c.req.param());
    const body = dueActionBodySchema.parse(await readJsonBody(c));
    return ok(
      c,
      await dueService.setAction(
        c.get("actor"),
        memberId,
        typeId,
        body,
        new Date(),
      ),
    );
  },

  /** E34 */
  async clearAction(c: DueContext) {
    const { memberId, typeId } = dueActionParamsSchema.parse(c.req.param());
    await dueService.clearAction(c.get("actor"), memberId, typeId);
    return ok(c, {});
  },
};
