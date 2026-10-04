import { describe, expect, test } from "bun:test";

import {
  dataOf,
  expectError,
  type ListItem,
  useMembersSuite,
} from "./support/suite";

// E16 GET /api/members: the length of the search text `q`.
// BR-REC-07 (search needs 2+ characters) and api-contract changelog 2026-10-04 v1:
// "E16 `q` is 2-100 characters". The text is trimmed first, so the padding around it
// is not counted. Fewer than 2 or more than 100 -> 400 VALIDATION_ERROR on `q`.
// The "under 2" side is covered in list-search.test.ts; this file is the upper limit.
// No members are needed: a text of this length matches nobody, the status and the
// error are what counts.

const s = useMembersSuite();

/** `n` copies of `ch`. */
const chars = (n: number, ch = "x") => ch.repeat(n);

const expectQRefused = (reply: Awaited<ReturnType<typeof s.list>>) => {
  expectError(reply, 400, "VALIDATION_ERROR");
  const issues = (reply.body?.details?.issues ?? []) as { path: string }[];
  expect(issues.some((i) => String(i.path).includes("q"))).toBe(true);
};

describe("E16 search text, upper limit of 100 characters (BR-REC-07)", () => {
  test("BR-REC-07 a text of 99 characters is accepted: 200 with an empty list", async () => {
    const reply = await s.list({ q: chars(99) });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
  });

  test("BR-REC-07 a text of exactly 100 characters is accepted: 200 with an empty list", async () => {
    const reply = await s.list({ q: chars(100) });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
  });

  test("BR-REC-07 a text of 101 characters is 400 VALIDATION_ERROR on q", async () => {
    expectQRefused(await s.list({ q: chars(101) }));
  });

  test("BR-REC-07 a text of 250 characters is 400 VALIDATION_ERROR on q", async () => {
    expectQRefused(await s.list({ q: chars(250) }));
  });

  test("BR-REC-07 the spaces around the text are not counted: 100 characters with padding on both sides is accepted", async () => {
    const reply = await s.list({ q: `   ${chars(100)}   ` });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
  });

  test("BR-REC-07 the spaces around the text are not counted: 100 characters with padding only in front is accepted", async () => {
    const reply = await s.list({ q: ` ${chars(100)}` });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
  });

  test("BR-REC-07 the spaces around the text are not counted: 100 characters with padding only behind is accepted", async () => {
    const reply = await s.list({ q: `${chars(100)} ` });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
  });

  test("BR-REC-07 the spaces around the text are not counted: 101 characters with padding on both sides is still 400 VALIDATION_ERROR on q", async () => {
    expectQRefused(await s.list({ q: `   ${chars(101)}   ` }));
  });

  test("BR-REC-07 a space inside the text is a character: 50 + space + 50 is 101 characters, 400 VALIDATION_ERROR on q", async () => {
    expectQRefused(await s.list({ q: `${chars(50)} ${chars(50)}` }));
  });

  test("BR-REC-07 a space inside the text is a character: 50 + space + 49 is exactly 100 characters, accepted", async () => {
    const reply = await s.list({ q: `${chars(50)} ${chars(49)}` });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
  });

  test("BR-REC-07 the limit also holds for a text made only of digits (the phone match): 100 digits accepted, 101 refused", async () => {
    const ok = await s.list({ q: chars(100, "7") });
    expect(dataOf<ListItem[]>(ok)).toEqual([]);
    expectQRefused(await s.list({ q: chars(101, "7") }));
  });

  test("BR-REC-07 a 101-character text is refused whatever the other filters are", async () => {
    expectQRefused(
      await s.list({ q: chars(101), status: "any", pageSize: 25 }),
    );
  });

  test("BR-REC-07 a 100-character text with the other filters still answers 200", async () => {
    const reply = await s.list({ q: chars(100), status: "any", pageSize: 25 });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
  });
});
