import { healthRepository } from "../repository/healthRepository";
import type { Health } from "../types/health.types";

export const healthService = {
  /** Reports DB connectivity; a failed ping is "degraded", never a thrown 500. */
  async check(): Promise<Health> {
    const dbUp = await healthRepository.ping();
    return dbUp
      ? { status: "ok", db: "up" }
      : { status: "degraded", db: "down" };
  },
};
