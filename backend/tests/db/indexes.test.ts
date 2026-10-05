import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "../../src/db/client";

// data-model v4: BR-REC-206 (every read path in the index map has its index, nothing else is
// indexed, no extension / trigram index), BR-REC-207 (the name index is exactly
// `lower(full_name) collate "C", id`, partial on non-archived members).
// Read-only catalog queries against the test DB (*_test).

type Idx = { tablename: string; indexname: string; indexdef: string };

const all = async (): Promise<Idx[]> =>
  Array.from(
    await db.execute(
      sql`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`,
    ),
  ) as Idx[];

const def = async (name: string): Promise<string | undefined> =>
  (await all()).find((i) => i.indexname === name)?.indexdef;

/** the whitespace-and-case-insensitive form of a definition */
const norm = (d: string | undefined) =>
  (d ?? "").toLowerCase().replace(/\s+/g, " ").replace(/"/g, "");

// Table, index, the columns/expressions it is built on (data-model.md "Index map (v4)").
const MAP: Array<[table: string, index: string, on: string]> = [
  ["members", "members_phone_last10_idx", "right(phone_digits, 10)"],
  [
    "membership_periods",
    "membership_periods_member_start_idx",
    "member_id, start_on desc",
  ],
  ["membership_periods", "membership_periods_end_idx", "(end_on)"],
  ["assessments", "assessments_member_date_idx", "member_id, assessed_on desc"],
  [
    "assessments",
    "assessments_member_type_date_key",
    "(member_id, type_id, assessed_on)",
  ],
  [
    "measurements",
    "measurements_member_metric_date_idx",
    "member_id, metric_id, measured_on desc",
  ],
  ["measurements", "measurements_metric_date_idx", "(metric_id, measured_on)"],
  ["metrics", "metrics_type_sort_idx", "(type_id, sort_order)"],
  ["audit_log", "audit_log_entity_idx", "entity, entity_id, at desc"],
];

describe("BR-REC-206 every read path in the index map has its index", () => {
  for (const [table, index, on] of MAP) {
    test(`BR-REC-206 ${table} has ${index} on ${on}`, async () => {
      const found = (await all()).find((i) => i.indexname === index);
      expect(found?.tablename).toBe(table);
      expect(norm(found?.indexdef)).toContain(on);
    });
  }

  test("BR-REC-206 the same-member-type-date rule is a unique index", async () => {
    expect(norm(await def("assessments_member_type_date_key"))).toStartWith(
      "create unique index",
    );
  });

  test("BR-REC-206 overrides are read by member and type through the primary key (member_id, type_id)", async () => {
    const hit = (await all()).filter(
      (i) =>
        i.tablename === "due_overrides" &&
        /unique/i.test(i.indexdef) &&
        norm(i.indexdef).includes("(member_id, type_id)"),
    );
    expect(hit).toHaveLength(1);
  });
});

describe("BR-REC-206 nothing else is indexed", () => {
  test("BR-REC-206 apart from keys and uniqueness rules, only the index-map indexes (and the log / session ones the data model lists) exist", async () => {
    const isKey = (n: string) => /(_pkey|_pk|_unique|_key|_one_row)$/.test(n);
    const extra = (await all())
      .map((i) => i.indexname)
      .filter((n) => !isKey(n))
      .filter(
        (n) =>
          ![
            ...MAP.map(([, index]) => index),
            "members_name_active_idx",
            "audit_log_at_idx",
            "auth_sessions_prev_token_hash_idx",
            "auth_sessions_account_active_idx",
          ].includes(n),
      );
    expect(extra).toEqual([]);
  });

  test("BR-REC-206 members.email is not indexed on purpose", async () => {
    const hit = (await all()).filter(
      (i) => i.tablename === "members" && /\bemail\b/.test(i.indexdef),
    );
    expect(hit).toEqual([]);
  });

  test("BR-REC-206 assessments.type_id alone is not indexed on purpose", async () => {
    const hit = (await all()).filter(
      (i) =>
        i.tablename === "assessments" && norm(i.indexdef).includes("(type_id)"),
    );
    expect(hit).toEqual([]);
  });

  test("BR-REC-169 no trigram index and no pg_trgm / btree_gist extension", async () => {
    expect(
      (await all()).filter((i) => /using (gin|gist)\b|trgm/i.test(i.indexdef)),
    ).toEqual([]);
    const ext = Array.from(
      await db.execute(
        sql`select extname from pg_extension where extname in ('pg_trgm', 'btree_gist')`,
      ),
    );
    expect(ext).toEqual([]);
  });
});

describe("BR-REC-207 the name index serves the E16 / E39 order", () => {
  test('BR-REC-207 members_name_active_idx is on exactly lower(full_name) collate "C", id', async () => {
    expect(norm(await def("members_name_active_idx"))).toContain(
      "(lower(full_name) collate c, id)",
    );
  });

  test("BR-REC-207 members_name_active_idx stays partial on non-archived members", async () => {
    expect(norm(await def("members_name_active_idx"))).toContain(
      "where (archived_at is null)",
    );
  });
});
