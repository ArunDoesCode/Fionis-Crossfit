import { z } from "zod";

// Owner: performance stream. Endpoint E40 (api-contract.md, BR-REC-152).

/** The three vitals each page view reports. */
export const VITAL_NAMES = ["LCP", "INP", "CLS"] as const;

/** One web-vitals measurement (the `web-vitals` library's rating scale). */
export const vitalBodySchema = z.object({
  name: z.enum(VITAL_NAMES),
  /** ms for LCP and INP, unitless for CLS */
  value: z.number(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  /** the page route, e.g. `/admin/members` */
  route: z.string(),
});
export type VitalBody = z.infer<typeof vitalBodySchema>;
