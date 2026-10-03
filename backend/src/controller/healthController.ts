import type { Context } from "hono";

import { ok } from "../lib/http";
import { healthService } from "../service/healthService";

export const healthController = {
  async check(c: Context) {
    const health = await healthService.check();
    return ok(c, health, health.db === "up" ? 200 : 503);
  },
};
