import { type ZodType, z } from "zod";

/** Shared shape for every list endpoint's pagination envelope. */
export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(1),
});

/** `{ success: true, data: T }` — the default single-resource response shape. */
export function successResponse<T extends ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}

/** `{ success: true, data: T[], meta }` — the mandatory shape for every list endpoint. */
export function paginatedResponse<T extends ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(dataSchema),
    meta: paginationMetaSchema,
  });
}

/** `{ success: true }` — for endpoints that return no payload. */
export function emptySuccessResponse() {
  return z.object({ success: z.literal(true) });
}

/** `{ success: false, message, code?, details? }` — the global error envelope. */
export const errorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
