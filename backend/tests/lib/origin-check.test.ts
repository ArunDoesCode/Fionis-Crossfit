import { describe, expect, test } from "bun:test";

import { createApp } from "../../src/app";
import { originCheck } from "../../src/lib/origin-check";
import { getRegistry } from "../../src/lib/route-registry";
import { APP_ORIGIN, call, miniApp, UNKNOWN_ID } from "../helpers/http";

// BR-REC-37: a write (POST, PUT, PATCH, DELETE) whose Origin is not the app's
// address is refused with 403 CSRF_ORIGIN; GET never changes data.

const ALLOWED = "https://gym.example.test";
const WRITES = ["POST", "PUT", "PATCH", "DELETE"] as const;

function guardedApp(origins?: readonly string[]) {
  const app = miniApp();
  let handled = 0;
  app.use("*", origins ? originCheck(origins) : originCheck());
  app.all("/thing", (c) => {
    handled++;
    return c.json({ success: true, data: {} });
  });
  return { app, handled: () => handled };
}

describe("originCheck middleware", () => {
  for (const method of WRITES) {
    test(`BR-REC-37 ${method} from another site is refused with 403 CSRF_ORIGIN and the handler does not run`, async () => {
      const { app, handled } = guardedApp([ALLOWED]);
      const reply = await call(app, method, "/thing", {
        token: null,
        origin: "https://evil.example",
        body: {},
      });
      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({ success: false, code: "CSRF_ORIGIN" });
      expect(handled()).toBe(0);
    });

    test(`BR-REC-37 ${method} with no Origin header is refused with 403 CSRF_ORIGIN`, async () => {
      const { app, handled } = guardedApp([ALLOWED]);
      const reply = await call(app, method, "/thing", {
        token: null,
        origin: null,
        body: {},
      });
      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({ code: "CSRF_ORIGIN" });
      expect(handled()).toBe(0);
    });

    test(`BR-REC-37 ${method} from the app's own address goes through`, async () => {
      const { app, handled } = guardedApp([ALLOWED]);
      const reply = await call(app, method, "/thing", {
        token: null,
        origin: ALLOWED,
        body: {},
      });
      expect(reply.status).toBe(200);
      expect(handled()).toBe(1);
    });
  }

  for (const origin of [
    "http://gym.example.test", // other scheme
    "https://gym.example.test:8443", // other port
    "https://gym.example.test.evil.example", // look-alike host
    "https://evil.example",
    "null", // sandboxed pages send the text "null"
  ]) {
    test(`BR-REC-37 a write from Origin ${origin} is refused`, async () => {
      const { app } = guardedApp([ALLOWED]);
      const reply = await call(app, "POST", "/thing", {
        token: null,
        origin,
        body: {},
      });
      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({ code: "CSRF_ORIGIN" });
    });
  }

  test("BR-REC-37 GET goes through whatever the Origin (reads never change data)", async () => {
    const { app } = guardedApp([ALLOWED]);
    for (const origin of ["https://evil.example", ALLOWED, null]) {
      const reply = await call(app, "GET", "/thing", { token: null, origin });
      expect(reply.status).toBe(200);
    }
  });

  test("BR-REC-37 by default the app's address is APP_ORIGIN", async () => {
    const { app } = guardedApp();
    const own = await call(app, "POST", "/thing", {
      token: null,
      origin: APP_ORIGIN,
      body: {},
    });
    expect(own.status).toBe(200);
    const other = await call(app, "POST", "/thing", {
      token: null,
      origin: "https://evil.example",
      body: {},
    });
    expect(other.status).toBe(403);
  });
});

describe("Origin check on the real app", () => {
  const writeRoutes = () => {
    createApp();
    return getRegistry().filter((r) => r.method !== "GET");
  };

  test("BR-REC-37 a form on another site posting to /api/members gets 403 CSRF_ORIGIN, even when signed in", async () => {
    const reply = await call(createApp(), "POST", "/api/members", {
      origin: "https://evil.example",
      body: {},
    });
    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ success: false, code: "CSRF_ORIGIN" });
  });

  test("BR-REC-37 every write route refuses a foreign Origin with 403 CSRF_ORIGIN (sign-in routes too)", async () => {
    const app = createApp();
    const wrong: string[] = [];
    for (const route of writeRoutes()) {
      const path = route.path.replace(/:[A-Za-z0-9_]+/g, UNKNOWN_ID);
      for (const token of [undefined, null]) {
        const options = { origin: "https://evil.example", body: {} } as const;
        const reply = await call(
          app,
          route.method,
          path,
          token === null ? { ...options, token } : options,
        );
        if (reply.status !== 403 || reply.body?.code !== "CSRF_ORIGIN") {
          wrong.push(`${route.method} ${route.path} -> ${reply.status}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  test("BR-REC-37 every write route refuses a write with no Origin header", async () => {
    const app = createApp();
    const wrong: string[] = [];
    for (const route of writeRoutes()) {
      const path = route.path.replace(/:[A-Za-z0-9_]+/g, UNKNOWN_ID);
      const reply = await call(app, route.method, path, {
        origin: null,
        body: {},
      });
      if (reply.status !== 403 || reply.body?.code !== "CSRF_ORIGIN") {
        wrong.push(`${route.method} ${route.path} -> ${reply.status}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("BR-REC-37 a write from the app's own address is not refused as CSRF (signed out gets 401)", async () => {
    const reply = await call(createApp(), "POST", "/api/members", {
      token: null,
      origin: APP_ORIGIN,
      body: {},
    });
    expect(reply.status).toBe(401);
    expect(reply.body?.code).toBe("UNAUTHORIZED");
  });

  test("BR-REC-37 GET from another site is not refused", async () => {
    const reply = await call(createApp(), "GET", "/api/health", {
      origin: "https://evil.example",
    });
    expect(reply.status).toBe(200);
  });
});
