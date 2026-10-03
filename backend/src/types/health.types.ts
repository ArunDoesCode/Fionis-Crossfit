import { z } from "zod";

export const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["up", "down"]),
});

export type Health = z.infer<typeof healthSchema>;
