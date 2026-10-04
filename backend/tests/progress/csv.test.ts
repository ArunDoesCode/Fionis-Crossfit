import { describe, expect, test } from "bun:test";

import {
  CSV_BOM,
  CSV_HEADERS,
  csvCell,
  csvLine,
  displayValue,
  exportFileName,
} from "../../src/service/progressCsv";

// BR-REC-117 (UTF-8 with BOM, comma separated, `value` and `display`, archived column), BR-REC-118
// and P9 (a cell starting with = + - @ or a tab is written as text with a leading '), BR-REC-119
// (file names), P8 (header rows and cell rules). Pure functions: no database.

describe("BR-REC-117 / P8 the byte order mark and the header rows", () => {
  test("BR-REC-117 the BOM is U+FEFF", () => {
    expect(CSV_BOM).toBe("\uFEFF");
  });

  test("P8 members.csv columns", () => {
    expect([...CSV_HEADERS["members.csv"]]).toEqual([
      "member_id",
      "name",
      "phone",
      "email",
      "date_of_birth",
      "sex",
      "joined_on",
      "objective",
      "notes",
      "plan",
      "membership_status",
      "membership_end_on",
      "archived",
    ]);
  });

  test("P8 memberships.csv columns", () => {
    expect([...CSV_HEADERS["memberships.csv"]]).toEqual([
      "member_id",
      "name",
      "plan",
      "start_on",
      "end_on",
      "archived",
    ]);
  });

  test("BR-REC-117 / P8 measurements.csv columns: one row per value with value and display, plus archived", () => {
    expect([...CSV_HEADERS["measurements.csv"]]).toEqual([
      "member_id",
      "name",
      "assessment",
      "measurement",
      "unit",
      "date",
      "estimated",
      "value",
      "display",
      "archived",
    ]);
  });
});

describe("BR-REC-117 / P8 one cell", () => {
  test("a missing value is an empty cell", () => {
    expect(csvCell(null)).toBe("");
  });

  test("an empty text is an empty cell", () => {
    expect(csvCell("")).toBe("");
  });

  test("yes / no for true / false", () => {
    expect(csvCell(true)).toBe("yes");
    expect(csvCell(false)).toBe("no");
  });

  const numbers: [number, string][] = [
    [94.5, "94.5"],
    [122, "122"],
    [0, "0"],
    [0.001, "0.001"],
    [1234567.891, "1234567.891"],
  ];
  for (const [value, text] of numbers) {
    test(`a number is a plain decimal: ${value} -> ${text}`, () => {
      expect(csvCell(value)).toBe(text);
    });
  }

  test("plain text is written as it is", () => {
    expect(csvCell("Surya Pratap")).toBe("Surya Pratap");
    expect(csvCell("2026-10-03")).toBe("2026-10-03");
  });

  test("non-ASCII text is kept (UTF-8)", () => {
    expect(csvCell("Zoë Müller 张伟")).toBe("Zoë Müller 张伟");
  });

  test("a comma wraps the cell in quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  test("a quote wraps the cell and doubles the inner quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  test("a line feed wraps the cell in quotes", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  test("a carriage return wraps the cell in quotes", () => {
    expect(csvCell("line1\rline2")).toBe('"line1\rline2"');
  });

  test("a CRLF inside a cell is kept inside the quotes", () => {
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
  });

  test("a space, a semicolon or a single quote alone needs no wrapping", () => {
    expect(csvCell("a b; c'd")).toBe("a b; c'd");
  });
});

describe("BR-REC-118 / P9 the formula guard", () => {
  const guarded: [string, string, string][] = [
    [
      "equals sign",
      '=HYPERLINK("http://x","y")',
      '"\'=HYPERLINK(""http://x"",""y"")"',
    ],
    ["plus", "+919876543210", "'+919876543210"],
    ["minus", "-1.5", "'-1.5"],
    ["at sign", "@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["tab", "\tcmd", "'\tcmd"],
    ["equals, simple", "=1+1", "'=1+1"],
  ];
  for (const [label, input, expected] of guarded) {
    test(`BR-REC-118 a cell starting with ${label} gets a leading '`, () => {
      expect(csvCell(input)).toBe(expected);
    });
  }

  test("BR-REC-118 spec example: =HYPERLINK(...) -> '=HYPERLINK(...)", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });

  test("P9 the guard also covers numbers: a negative value exports as text", () => {
    expect(csvCell(-1.5)).toBe("'-1.5");
    expect(csvCell(-0.001)).toBe("'-0.001");
  });

  test("P9 the guard runs before the quoting: a guarded cell with a comma is then wrapped", () => {
    expect(csvCell("=A1,B1")).toBe('"\'=A1,B1"');
  });

  test("P9 only the first character matters: = + - @ inside the text are left alone", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("1+1")).toBe("1+1");
    expect(csvCell("x-ray")).toBe("x-ray");
    expect(csvCell("me@gym.example")).toBe("me@gym.example");
  });

  test("P9 a phone starting with a digit is not changed", () => {
    expect(csvCell("9876543210")).toBe("9876543210");
  });

  test("P9 a text already starting with a quote mark is not guarded again", () => {
    expect(csvCell("'=ok")).toBe("'=ok");
  });

  test("P9 a positive number needs no guard", () => {
    expect(csvCell(5)).toBe("5");
  });
});

describe("BR-REC-117 / P8 one line", () => {
  test("cells are joined by commas and the line ends with CRLF", () => {
    expect(csvLine(["a", "b", "c"])).toBe("a,b,c\r\n");
  });

  test("every cell goes through the cell rules (null, boolean, number, guard, quotes)", () => {
    expect(csvLine(["x", null, 94.5, true, false, "=1", "a,b"])).toBe(
      'x,,94.5,yes,no,\'=1,"a,b"\r\n',
    );
  });

  test("a single empty cell is just the line end", () => {
    expect(csvLine([null])).toBe("\r\n");
  });

  test("a line feed inside a cell stays inside quotes and the line still ends with CRLF", () => {
    expect(csvLine(["a", "b\nc"])).toBe('a,"b\nc"\r\n');
  });
});

describe("BR-REC-117 / P8 display text", () => {
  const cases: [string, number, "number" | "duration", 0 | 1 | 2, string][] = [
    ["spec example: Plank 122 s -> 2:02", 122, "duration", 0, "2:02"],
    ["Fran 250 s -> 4:10", 250, "duration", 0, "4:10"],
    ["Fran 320 s -> 5:20", 320, "duration", 0, "5:20"],
    ["59 s -> 0:59", 59, "duration", 0, "0:59"],
    ["60 s -> 1:00", 60, "duration", 0, "1:00"],
    ["0 s -> 0:00", 0, "duration", 0, "0:00"],
    ["599 s -> 9:59", 599, "duration", 0, "9:59"],
    ["a number with 1 decimal: 94 -> 94.0", 94, "number", 1, "94.0"],
    ["a number with 1 decimal: 94.56 -> 94.6", 94.56, "number", 1, "94.6"],
    ["a number with 1 decimal: 94.4 -> 94.4", 94.4, "number", 1, "94.4"],
    ["a number with 0 decimals: 94 -> 94", 94, "number", 0, "94"],
    ["a number with 0 decimals: 3 -> 3", 3, "number", 0, "3"],
    ["a number with 2 decimals: 7 -> 7.00", 7, "number", 2, "7.00"],
    ["a number with 2 decimals: 7.456 -> 7.46", 7.456, "number", 2, "7.46"],
  ];
  for (const [label, value, datatype, decimals, expected] of cases) {
    test(`BR-REC-117 ${label}`, () => {
      expect(displayValue(value, datatype, decimals)).toBe(expected);
    });
  }

  test("BR-REC-117 the display has no unit", () => {
    expect(displayValue(94, "number", 1)).not.toContain("kg");
  });
});

describe("BR-REC-119 file names", () => {
  test("measurements-2026-10-03.csv", () => {
    expect(exportFileName("measurements.csv", "2026-10-03")).toBe(
      "measurements-2026-10-03.csv",
    );
  });

  test("members-<today>.csv", () => {
    expect(exportFileName("members.csv", "2026-01-05")).toBe(
      "members-2026-01-05.csv",
    );
  });

  test("memberships-<today>.csv", () => {
    expect(exportFileName("memberships.csv", "2026-12-31")).toBe(
      "memberships-2026-12-31.csv",
    );
  });
});
