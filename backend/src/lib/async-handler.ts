import type { Context } from "hono";

type AsyncRouteHandler<TContext extends Context, TResult> = (
  c: TContext,
) => TResult | Promise<TResult>;

/**
 * Wraps every controller handler so sync and async throws reach the global
 * error handler (`app.onError`) as rejections. Controllers never catch.
 */
export function asyncHandler<TContext extends Context, TResult>(
  handler: AsyncRouteHandler<TContext, TResult>,
): (c: TContext) => Promise<TResult> {
  return async (c) => handler(c);
}
