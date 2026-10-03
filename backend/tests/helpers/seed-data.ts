import { sql } from "drizzle-orm";

import { db } from "../../src/db/client";

/** The two assessments `bun run seed` creates (BR-REC-10, 13), and the label of test-made ones. */
export const SEEDED_TYPE_NAMES = ["Body composition", "Fitness test"] as const;
const TEST_TYPE_LIKE = "TEST\\_foundation\\_%";

const typeIds = sql`(select id from assessment_types where name in ('Body composition', 'Fitness test') or name like ${TEST_TYPE_LIKE})`;

/**
 * Removes the catalog rows a seed test creates (the seeded assessments with their
 * measurements, and TEST_foundation_ assessments) and checks the catalog is empty.
 * Only these rows are touched; anything else in the catalog makes the test stop
 * with a clear message instead of deleting it.
 */
export async function resetCatalog(): Promise<void> {
  await db.execute(sql`delete from due_overrides where type_id in ${typeIds}`);
  await db.execute(sql`delete from assessments where type_id in ${typeIds}`);
  await db.execute(sql`delete from metrics where type_id in ${typeIds}`);
  await db.execute(
    sql`delete from assessment_types where name in ('Body composition', 'Fitness test') or name like ${TEST_TYPE_LIKE}`,
  );
  const left = await db.execute(
    sql`select count(*)::int as n from assessment_types`,
  );
  const n = (Array.from(left)[0] as { n: number }).n;
  if (n !== 0) {
    throw new Error(
      `The test database catalog holds ${n} assessment type(s) this test did not create. Run \`bun run db:test:prepare\` (or db:reset on the test DB) and retry.`,
    );
  }
}

/** The settings row and the lock-counter row are created by `seed`; tests start without them. */
export async function resetSingletons(): Promise<void> {
  await db.execute(sql`delete from gym_settings`);
  await db.execute(sql`delete from login_attempts`);
}

export type CatalogMetric = {
  type: string;
  name: string;
  unit: string;
  datatype: string;
  decimals: number;
  better: string;
  plausibleMin: number | null;
  plausibleMax: number | null;
  intervalCount: number | null;
  intervalUnit: string | null;
  tableGroup: string | null;
  tablePart: string | null;
  isActive: boolean;
  sortOrder: number;
};

type Raw = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function readMetrics(): Promise<CatalogMetric[]> {
  const rows = Array.from(
    await db.execute(sql`
      select t.name as type, m.name, m.unit, m.datatype, m.decimals, m.better,
             m.plausible_min, m.plausible_max, m.interval_count, m.interval_unit,
             m.table_group, m.table_part, m.is_active, m.sort_order
      from metrics m join assessment_types t on t.id = m.type_id
      order by t.sort_order, m.sort_order`),
  ) as Raw[];
  return rows.map((r) => ({
    type: String(r.type),
    name: String(r.name),
    unit: String(r.unit),
    datatype: String(r.datatype),
    decimals: Number(r.decimals),
    better: String(r.better),
    plausibleMin: num(r.plausible_min),
    plausibleMax: num(r.plausible_max),
    intervalCount: num(r.interval_count),
    intervalUnit: r.interval_unit === null ? null : String(r.interval_unit),
    tableGroup: r.table_group === null ? null : String(r.table_group),
    tablePart: r.table_part === null ? null : String(r.table_part),
    isActive: Boolean(r.is_active),
    sortOrder: Number(r.sort_order),
  }));
}

export type CatalogType = {
  id: string;
  name: string;
  intervalCount: number;
  intervalUnit: string;
  isActive: boolean;
  sortOrder: number;
};

export async function readTypes(): Promise<CatalogType[]> {
  const rows = Array.from(
    await db.execute(
      sql`select id, name, interval_count, interval_unit, is_active, sort_order from assessment_types order by sort_order`,
    ),
  ) as Raw[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    intervalCount: Number(r.interval_count),
    intervalUnit: String(r.interval_unit),
    isActive: Boolean(r.is_active),
    sortOrder: Number(r.sort_order),
  }));
}
