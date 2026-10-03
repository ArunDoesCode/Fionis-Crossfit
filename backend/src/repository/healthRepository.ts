import { sql } from "drizzle-orm";

import { db } from "../db/client";

export const healthRepository = {
  async ping(): Promise<boolean> {
    try {
      await db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  },
};
