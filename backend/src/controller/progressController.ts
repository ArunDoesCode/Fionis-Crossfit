import type { Context } from "hono";

import { ok, okPaginated } from "../lib/http";
import type { AppEnv } from "../lib/types";
import { progressService } from "../service/progressService";
import { memberIdParamsSchema } from "../types/common.types";
import {
  exportParamsSchema,
  leaderboardQuerySchema,
  progressQuerySchema,
} from "../types/progress.types";

type ProgressContext = Context<AppEnv>;

const encoder = new TextEncoder();

/**
 * The chunks as a byte stream the client reads at its own pace: a batch is read only when the one
 * before it was taken. A client that hangs up stops the reading; a failure after the headers went
 * out can only cut the download, so it is logged here (the global handler cannot answer any more).
 */
function streamOf(
  chunks: AsyncGenerator<string, void, void>,
): ReadableStream<Uint8Array> {
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next();
        // the client hung up while this batch was being read: nobody is left to take it
        if (cancelled) return;
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        if (cancelled) return;
        console.error("CSV export failed while streaming", error);
        controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      await chunks.return();
    },
  });
}

export const progressController = {
  /** E35 */
  async reportCard(c: ProgressContext) {
    const { memberId } = memberIdParamsSchema.parse(c.req.param());
    return ok(c, await progressService.reportCard(memberId, new Date()));
  },

  /** E36 */
  async progress(c: ProgressContext) {
    const query = progressQuerySchema.parse(c.req.query());
    return ok(c, await progressService.progress(query, new Date()));
  },

  /** E37 */
  async leaderboard(c: ProgressContext) {
    const query = leaderboardQuerySchema.parse(c.req.query());
    const { items, total } = await progressService.leaderboard(query);
    return okPaginated(c, items, {
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  },

  /** E38 */
  async activeByPlan(c: ProgressContext) {
    return ok(c, await progressService.activeByPlan(new Date()));
  },

  /** E39: not JSON; the headers go out first, the rows follow in batches. */
  async export(c: ProgressContext) {
    const { file } = exportParamsSchema.parse(c.req.param());
    const { fileName, chunks } = await progressService.openExport(
      file,
      new Date(),
    );
    return c.body(streamOf(chunks), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    });
  },
};
