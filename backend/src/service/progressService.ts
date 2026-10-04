import { addMonths, gymToday, type IsoDate } from "../lib/domain/dates";
import { membershipStatus } from "../lib/domain/membership";
import {
  ageBandBirthRange,
  countActiveByPlan,
  progressStats,
  type ReportCardInput,
  rankLeaderboard,
  reportCard,
} from "../lib/domain/report";
import { AppError, BadRequestError, NotFoundError } from "../lib/errors";
import {
  type CatalogRow,
  type MemberKey,
  progressRepository,
} from "../repository/progressRepository";
import {
  type ActiveByPlan,
  EXPORT_FILES,
  type ExportFile,
  type LeaderboardItem,
  type LeaderboardQuery,
  type ProgressQuery,
  type ProgressStats,
  type ReportCard,
} from "../types/progress.types";
import {
  csvPreamble,
  exportFileName,
  measurementCsvLine,
  memberCsvLine,
  membershipCsvLine,
} from "./progressCsv";

// Progress (report card, gym progress, leaderboards, CSV export): BR-REC-22..24, 106..119.
// Every function takes `now`; only controllers read the clock. Nothing is cached (BR-REC-110) and
// nothing is written, so no change-log row is made. The rules live in `lib/domain/report.ts`;
// this file loads the data, calls them and shapes the answer.

/** A row the data must hold (every member has a period) is missing: a bug, answered as a generic 500. */
const invariantBroken = () =>
  new AppError("Internal server error", 500, "INTERNAL_ERROR");

/** Status of a latest period on `today` (BR-REC-52), only ever through the domain function. */
function statusOf(
  period: { startOn: IsoDate; endOn: IsoDate },
  today: IsoDate,
  leadDays: number,
) {
  const summary = membershipStatus(period, today, leadDays);
  if (!summary) throw invariantBroken();
  return summary.status;
}

/** The catalog rows (setup order) as the report card's types with their measurements. */
function catalogTypes(rows: CatalogRow[]): ReportCardInput["types"] {
  const types = new Map<string, ReportCardInput["types"][number]>();
  for (const row of rows) {
    let type = types.get(row.typeId);
    if (type === undefined) {
      type = {
        id: row.typeId,
        name: row.typeName,
        sortOrder: row.typeSortOrder,
        metrics: [],
      };
      types.set(row.typeId, type);
    }
    type.metrics.push({
      id: row.metricId,
      name: row.name,
      unit: row.unit,
      datatype: row.datatype,
      decimals: row.decimals,
      better: row.better,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      tableGroup: row.tableGroup,
      tablePart: row.tablePart,
    });
  }
  return [...types.values()];
}

// ─── E39: batches ───────────────────────────────────────────────────────────

/**
 * How many members one batch reads (members are paged by a keyset on name and id, so no batch
 * re-reads the ones before it): about a few thousand rows a batch for the file's usual shape.
 * members.csv is one row per member; memberships.csv a few periods each; measurements.csv a few
 * hundred values each (the perf seed holds 343), so 10 members are about 3,400 rows.
 */
const EXPORT_BATCH_MEMBERS = {
  "members.csv": 2000,
  "memberships.csv": 500,
  "measurements.csv": 10,
} as const satisfies Record<ExportFile, number>;

const isExportFile = (file: string): file is ExportFile =>
  (EXPORT_FILES as readonly string[]).includes(file);

/** Keyset pages of members in export order until a page comes back short. */
async function* memberPages<T extends MemberKey>(
  read: (after: MemberKey | undefined, limit: number) => Promise<T[]>,
  size: number,
): AsyncGenerator<T[], void, void> {
  let after: MemberKey | undefined;
  for (;;) {
    const page = await read(after, size);
    if (page.length > 0) yield page;
    const last = page[page.length - 1];
    if (last === undefined || page.length < size) return;
    after = { nameKey: last.nameKey, id: last.id };
  }
}

/** Rows grouped by member, each group in the order the rows came. */
function byMember<T extends { memberId: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.memberId);
    if (group) group.push(row);
    else groups.set(row.memberId, [row]);
  }
  return groups;
}

async function* memberLines(
  today: IsoDate,
  leadDays: number,
): AsyncGenerator<string, void, void> {
  for await (const page of memberPages(
    progressRepository.exportMemberPage,
    EXPORT_BATCH_MEMBERS["members.csv"],
  )) {
    yield page
      .map((row) =>
        memberCsvLine({
          ...row,
          status:
            row.startOn !== null && row.endOn !== null
              ? statusOf(
                  { startOn: row.startOn, endOn: row.endOn },
                  today,
                  leadDays,
                )
              : null,
        }),
      )
      .join("");
  }
}

/**
 * memberships.csv and measurements.csv: a page of members, then the rows of just those members
 * (one query), written under their member in the page's order. A page with no rows yields nothing.
 */
async function* linesPerMember<Row extends { memberId: string }>(
  size: number,
  readRows: (memberIds: string[]) => Promise<Row[]>,
  line: (row: Row, member: { fullName: string; archived: boolean }) => string,
): AsyncGenerator<string, void, void> {
  for await (const page of memberPages(
    progressRepository.exportMemberKeyPage,
    size,
  )) {
    const rows = byMember(await readRows(page.map((member) => member.id)));
    const text = page
      .flatMap((member) =>
        (rows.get(member.id) ?? []).map((row) => line(row, member)),
      )
      .join("");
    if (text !== "") yield text;
  }
}

/** The BOM and header row first (no database read), then one string per batch of rows. */
async function* exportChunks(
  file: ExportFile,
  today: IsoDate,
  leadDays: number,
): AsyncGenerator<string, void, void> {
  yield csvPreamble(file);
  switch (file) {
    case "members.csv":
      yield* memberLines(today, leadDays);
      return;
    case "memberships.csv":
      yield* linesPerMember(
        EXPORT_BATCH_MEMBERS[file],
        progressRepository.exportPeriods,
        (row, member) => membershipCsvLine({ ...row, ...member }),
      );
      return;
    case "measurements.csv":
      yield* linesPerMember(
        EXPORT_BATCH_MEMBERS[file],
        progressRepository.exportValues,
        (row, member) => measurementCsvLine({ ...row, ...member }),
      );
      return;
  }
}

export const progressService = {
  /**
   * E35 (BR-REC-22, 106-108, P2, P3): three reads (the member with its latest period, the catalog,
   * the member's values) plus the settings, then the pure `reportCard`. Archived members answer too.
   */
  async reportCard(memberId: string, now: Date): Promise<ReportCard> {
    const [settings, head, catalog, values] = await Promise.all([
      progressRepository.readGymSettings(),
      progressRepository.findMemberHead(memberId),
      progressRepository.listCatalog(),
      progressRepository.listMemberValues(memberId),
    ]);
    if (!head) throw new NotFoundError("Member not found");
    if (head.plan === null || head.startOn === null || head.endOn === null) {
      throw invariantBroken();
    }
    const today = gymToday(now, settings.timezone);
    return reportCard({
      gymName: settings.gymName,
      today,
      member: head,
      membership: {
        plan: head.plan,
        status: statusOf(
          { startOn: head.startOn, endOn: head.endOn },
          today,
          settings.expiryLeadDays,
        ),
      },
      types: catalogTypes(catalog),
      values,
    });
  },

  /**
   * E36 (BR-REC-23, 110-114, P4, P5): the first and latest reading of the measurement per matching
   * non-archived member, aggregated in the database; the pure `progressStats` does the counting.
   */
  async progress(query: ProgressQuery, now: Date): Promise<ProgressStats> {
    const [metric, settings] = await Promise.all([
      progressRepository.findMetric(query.metricId),
      query.ageBand === undefined
        ? undefined
        : progressRepository.readGymSettings(),
    ]);
    if (!metric) throw new NotFoundError("Measurement not found");
    const born =
      query.ageBand === undefined || settings === undefined
        ? { onOrBefore: null, after: null }
        : ageBandBirthRange(query.ageBand, gymToday(now, settings.timezone));
    const summaries = await progressRepository.readingSummaries({
      metricId: metric.id,
      joinedOnOrAfter:
        query.joinedFrom === undefined ? undefined : `${query.joinedFrom}-01`,
      joinedBefore:
        query.joinedTo === undefined
          ? undefined
          : addMonths(`${query.joinedTo}-01`, 1),
      plan: query.plan,
      sex: query.sex,
      bornOnOrBefore: born.onOrBefore,
      bornAfter: born.after,
    });
    return { metric, ...progressStats(metric.better, summaries) };
  },

  /**
   * E37 (BR-REC-115, P6): 404 for an unknown measurement, then 400 `NO_DIRECTION`. Every ranked
   * member comes back from one query, is ranked by the pure `rankLeaderboard`, and the page is cut
   * from the full ranking, so ranks continue across pages.
   */
  async leaderboard(
    query: LeaderboardQuery,
  ): Promise<{ items: LeaderboardItem[]; total: number }> {
    const metric = await progressRepository.findMetric(query.metricId);
    if (!metric) throw new NotFoundError("Measurement not found");
    if (metric.better === "none") {
      throw new BadRequestError(
        "This measurement has no better direction",
        "NO_DIRECTION",
      );
    }
    const ranked = rankLeaderboard(
      await progressRepository.latestReadings(metric.id, query.sex),
      metric.better,
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      items: ranked.slice(start, start + query.pageSize),
      total: ranked.length,
    };
  },

  /**
   * E38 (BR-REC-116, P7): the latest period of each non-archived member, its status through
   * `membershipStatus`, counted by the pure `countActiveByPlan`.
   */
  async activeByPlan(now: Date): Promise<ActiveByPlan> {
    const [settings, periods] = await Promise.all([
      progressRepository.readGymSettings(),
      progressRepository.listLatestPeriods(),
    ]);
    const today = gymToday(now, settings.timezone);
    return countActiveByPlan(
      periods.map((period) => ({
        plan: period.plan,
        status: statusOf(period, today, settings.expiryLeadDays),
      })),
    );
  },

  /**
   * E39 (BR-REC-24, 117-119, P8-P10, P13): an unknown file is 404 before anything is read or sent.
   * Returns the file name and the chunks: the first holds the BOM and the header row and needs no
   * read; each later one is a batch of rows, read when the client has taken the one before.
   */
  async openExport(
    file: string,
    now: Date,
  ): Promise<{ fileName: string; chunks: AsyncGenerator<string, void, void> }> {
    if (!isExportFile(file)) throw new NotFoundError("Unknown export file");
    const settings = await progressRepository.readGymSettings();
    const today = gymToday(now, settings.timezone);
    return {
      fileName: exportFileName(file, today),
      chunks: exportChunks(file, today, settings.expiryLeadDays),
    };
  },
};
