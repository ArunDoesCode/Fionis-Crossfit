import type { Context } from "hono";

import { ok, okPaginated, readJsonBody } from "../lib/http";
import type { AppEnv } from "../lib/types";
import { membersService } from "../service/membersService";
import { memberIdParamsSchema } from "../types/common.types";
import {
  createMemberBodySchema,
  memberListQuerySchema,
  updateMemberBodySchema,
} from "../types/members.types";

type MembersContext = Context<AppEnv>;

export const membersController = {
  /** E16 */
  async list(c: MembersContext) {
    const query = memberListQuerySchema.parse(c.req.query());
    const { items, total } = await membersService.list(query, new Date());
    return okPaginated(c, items, {
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  },

  /** E17 */
  async create(c: MembersContext) {
    const body = createMemberBodySchema.parse(await readJsonBody(c));
    const member = await membersService.create(
      c.get("actor"),
      body,
      new Date(),
    );
    return ok(c, member, 201);
  },

  /** E18 */
  async get(c: MembersContext) {
    const { memberId } = memberIdParamsSchema.parse(c.req.param());
    return ok(c, await membersService.get(memberId, new Date()));
  },

  /** E19 */
  async update(c: MembersContext) {
    const { memberId } = memberIdParamsSchema.parse(c.req.param());
    const body = updateMemberBodySchema.parse(await readJsonBody(c));
    const member = await membersService.update(
      c.get("actor"),
      memberId,
      body,
      new Date(),
    );
    return ok(c, member);
  },

  /** E20 */
  async archive(c: MembersContext) {
    const { memberId } = memberIdParamsSchema.parse(c.req.param());
    const member = await membersService.archive(
      c.get("actor"),
      memberId,
      new Date(),
    );
    return ok(c, member);
  },

  /** E21 */
  async restore(c: MembersContext) {
    const { memberId } = memberIdParamsSchema.parse(c.req.param());
    const member = await membersService.restore(
      c.get("actor"),
      memberId,
      new Date(),
    );
    return ok(c, member);
  },
};
