import { describe, expect, test } from "bun:test";

import { ageBand } from "../../../src/lib/domain/report";

// BR-REC-114: age bands are 10 years wide from 20 (Under 20, 20-29, 30-39, 40-49, 50-59, 60+), by
// the age on the gym's today (Q2). The band codes are the E36 `ageBand` values.

describe("BR-REC-114 age bands by age today", () => {
  const TODAY = "2026-10-03";

  const cases: [string, string, string][] = [
    // spec examples
    ["born 1996-11-01 is 29 on 3 Oct 2026", "1996-11-01", "20to29"],
    ["born 2007-01-15 is 19 on 3 Oct 2026", "2007-01-15", "under20"],
    // edges: the day before and the day of each birthday that changes the band
    ["19 (20th birthday is tomorrow)", "2006-10-04", "under20"],
    ["20 (20th birthday is today)", "2006-10-03", "20to29"],
    ["29 (30th birthday is tomorrow)", "1996-10-04", "20to29"],
    ["30 (30th birthday is today)", "1996-10-03", "30to39"],
    ["39 (40th birthday is tomorrow)", "1986-10-04", "30to39"],
    ["40 (40th birthday is today)", "1986-10-03", "40to49"],
    ["49 (50th birthday is tomorrow)", "1976-10-04", "40to49"],
    ["50 (50th birthday is today)", "1976-10-03", "50to59"],
    ["59 (60th birthday is tomorrow)", "1966-10-04", "50to59"],
    ["59 and 364 days", "1966-10-05", "50to59"],
    ["60 (60th birthday is today)", "1966-10-03", "60plus"],
    // away from the edges
    ["a baby is under 20", "2026-01-01", "under20"],
    ["born today is under 20", "2026-10-03", "under20"],
    ["25", "2001-04-20", "20to29"],
    ["35", "1991-04-20", "30to39"],
    ["45", "1981-04-20", "40to49"],
    ["55", "1971-04-20", "50to59"],
    ["72", "1954-04-20", "60plus"],
    ["95", "1931-04-20", "60plus"],
  ];

  for (const [label, dateOfBirth, band] of cases) {
    test(`BR-REC-114 ${label} -> ${band}`, () => {
      expect(ageBand(dateOfBirth, TODAY)).toBe(band as never);
    });
  }

  test("BR-REC-114 a 29 February birthday: not 20 on 28 Feb, 20 on 29 Feb of a leap year", () => {
    // born 2000-02-29; 2020 is a leap year
    expect(ageBand("2000-02-29", "2020-02-28")).toBe("under20");
    expect(ageBand("2000-02-29", "2020-02-29")).toBe("20to29");
  });

  test("BR-REC-114 the band follows the day it is asked on", () => {
    expect(ageBand("2006-10-03", "2026-10-02")).toBe("under20");
    expect(ageBand("2006-10-03", "2026-10-03")).toBe("20to29");
    expect(ageBand("2006-10-03", "2036-10-02")).toBe("20to29");
    expect(ageBand("2006-10-03", "2036-10-03")).toBe("30to39");
  });
});
