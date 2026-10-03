import { afterAll, describe, expect, test } from "bun:test";

import { eq, like } from "drizzle-orm";

import { db } from "../../src/db/client";
import { auditLog, members } from "../../src/db/schemas";
import { diffChangedFields, writeAudit } from "../../src/lib/audit";
import { pgErrorOf, Rollback } from "../helpers/db";

// BR-REC-158: every write runs in one transaction together with its change-log
// row (session, action, old -> new). BR-REC-43: never the password or a token.

const P = "TEST_foundation_audit";

afterAll(async () => {
  await db.delete(auditLog).where(like(auditLog.action, `${P}%`));
  await db.delete(members).where(like(members.fullName, `${P}%`));
});

const rowsFor = (action: string) =>
  db.select().from(auditLog).where(eq(auditLog.action, action));

describe("writeAudit", () => {
  test("BR-REC-158 a committed write leaves exactly one change-log row with session, action, entity and old -> new", async () => {
    const sessionId = crypto.randomUUID();
    const action = `${P}.member.update.${crypto.randomUUID()}`;
    await db.transaction(async (tx) => {
      await writeAudit(tx, {
        sessionId,
        action,
        entity: "member",
        entityId: "m-1",
        before: { fullName: "Surya Pratap" },
        after: { fullName: "Surya P" },
      });
    });
    const rows = await rowsFor(action);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId,
      action,
      entity: "member",
      entityId: "m-1",
      before: { fullName: "Surya Pratap" },
      after: { fullName: "Surya P" },
    });
    expect(rows[0]?.at).toBeInstanceOf(Date);
  });

  test("BR-REC-158 a server command or failed sign-in is logged with no session", async () => {
    const action = `${P}.auth.unlock.${crypto.randomUUID()}`;
    await db.transaction(async (tx) => {
      await writeAudit(tx, { sessionId: null, action });
    });
    const rows = await rowsFor(action);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId).toBeNull();
  });

  test("BR-REC-158 the network address and device are kept", async () => {
    const action = `${P}.auth.login.${crypto.randomUUID()}`;
    await db.transaction(async (tx) => {
      await writeAudit(tx, {
        sessionId: null,
        action,
        ip: "203.0.113.7",
        device: "Chrome on Android",
      });
    });
    expect(await rowsFor(action)).toMatchObject([
      { ip: "203.0.113.7", device: "Chrome on Android" },
    ]);
  });

  test("BR-REC-158 when the transaction rolls back, the change-log row and the write both vanish", async () => {
    const action = `${P}.member.create.${crypto.randomUUID()}`;
    const fullName = `${P} member ${crypto.randomUUID()}`;
    await db
      .transaction(async (tx) => {
        await tx.insert(members).values({
          fullName,
          phone: "9845012345",
          phoneDigits: "9845012345",
          dateOfBirth: "1982-05-10",
          sex: "male",
          joinedOn: "2025-06-01",
        });
        await writeAudit(tx, {
          sessionId: crypto.randomUUID(),
          action,
          entity: "member",
          after: { fullName },
        });
        // both are visible inside the transaction ...
        expect(
          await tx.select().from(auditLog).where(eq(auditLog.action, action)),
        ).toHaveLength(1);
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
    // ... and gone after it
    expect(await rowsFor(action)).toHaveLength(0);
    expect(
      await db.select().from(members).where(eq(members.fullName, fullName)),
    ).toHaveLength(0);
  });

  test("BR-REC-158 a write the database refuses leaves no change-log row", async () => {
    const action = `${P}.member.create.${crypto.randomUUID()}`;
    const error = await db
      .transaction(async (tx) => {
        await writeAudit(tx, { sessionId: crypto.randomUUID(), action });
        // refused by the database: sex must be male or female
        await tx.insert(members).values({
          fullName: `${P} bad`,
          phone: "9845012345",
          phoneDigits: "9845012345",
          dateOfBirth: "1982-05-10",
          sex: "other",
          joinedOn: "2025-06-01",
        } as never);
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(pgErrorOf(error).code).toBe("23514");
    expect(await rowsFor(action)).toHaveLength(0);
  });

  test("BR-REC-43 a password, password hash or token is never stored in before or after", async () => {
    const action = `${P}.auth.password.${crypto.randomUUID()}`;
    await db.transaction(async (tx) => {
      await writeAudit(tx, {
        sessionId: crypto.randomUUID(),
        action,
        entity: "account",
        before: {
          username: "owner",
          password: "old-secret-pw",
          passwordHash: "$argon2id$old",
          refreshToken: "tok-old",
        },
        after: {
          username: "owner",
          password: "new-secret-pw",
          passwordHash: "$argon2id$new",
          refreshToken: "tok-new",
        },
      });
    });
    const [row] = await rowsFor(action);
    const stored = JSON.stringify([row?.before, row?.after]);
    for (const secret of [
      "old-secret-pw",
      "new-secret-pw",
      "$argon2id$",
      "tok-old",
      "tok-new",
    ]) {
      expect(stored).not.toContain(secret);
    }
  });
});

describe("diffChangedFields", () => {
  test("BR-REC-158 only the changed fields come back, as before -> after", () => {
    expect(
      diffChangedFields(
        { fullName: "Surya Pratap", phone: "9845012345" },
        { fullName: "Surya P", phone: "9845012345" },
      ),
    ).toEqual({
      before: { fullName: "Surya Pratap" },
      after: { fullName: "Surya P" },
    });
  });

  test("BR-REC-158 several changed fields are all listed with the same keys on both sides", () => {
    const diff = diffChangedFields(
      { a: 1, b: "x", c: true, same: 9 },
      { a: 2, b: "y", c: false, same: 9 },
    );
    expect(diff).toEqual({
      before: { a: 1, b: "x", c: true },
      after: { a: 2, b: "y", c: false },
    });
  });

  test("BR-REC-158 nothing changed gives null (no change-log row needed)", () => {
    expect(diffChangedFields({ a: 1, b: "x" }, { a: 1, b: "x" })).toBeNull();
  });

  test("BR-REC-158 a created row counts every field as changed", () => {
    const diff = diffChangedFields(null, { fullName: "Surya", phone: "98450" });
    expect(Object.keys(diff?.after ?? {}).sort()).toEqual([
      "fullName",
      "phone",
    ]);
    expect(Object.keys(diff?.before ?? {}).sort()).toEqual([
      "fullName",
      "phone",
    ]);
    expect(diff?.after).toEqual({ fullName: "Surya", phone: "98450" });
    for (const value of Object.values(diff?.before ?? {})) {
      expect(value ?? null).toBeNull();
    }
  });

  test("BR-REC-158 a deleted row counts every field as changed", () => {
    const diff = diffChangedFields({ fullName: "Surya", phone: "98450" }, null);
    expect(diff?.before).toEqual({ fullName: "Surya", phone: "98450" });
    expect(Object.keys(diff?.after ?? {}).sort()).toEqual([
      "fullName",
      "phone",
    ]);
    for (const value of Object.values(diff?.after ?? {})) {
      expect(value ?? null).toBeNull();
    }
  });

  test("BR-REC-43 a changed password or token is never returned", () => {
    const diff = diffChangedFields(
      {
        fullName: "Owner",
        password: "old",
        passwordHash: "h1",
        refreshToken: "t1",
      },
      {
        fullName: "Owner 2",
        password: "new",
        passwordHash: "h2",
        refreshToken: "t2",
      },
    );
    expect(diff).toEqual({
      before: { fullName: "Owner" },
      after: { fullName: "Owner 2" },
    });
  });

  test("BR-REC-43 when only a password changed there is nothing to log", () => {
    expect(
      diffChangedFields({ password: "old" }, { password: "new" }),
    ).toBeNull();
  });
});
