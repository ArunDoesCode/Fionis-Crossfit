// BR-REC-38 — sign-in allows 10 requests a minute and refresh 30 a minute per network address,
// on top of the lock; the address comes from our own proxy's header (TRUST_PROXY_HOPS entries from
// the right), never from what the browser sent.
// Each scenario runs in a fresh server process (empty limiter, chosen TRUST_PROXY_HOPS), so it is
// neither affected by nor affecting the other tests' requests.
// Spec: docs/specs/member-records/auth.md; contract: .pipeline/member-records-auth/contract.md.
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";

import {
  type Fixture,
  installTestLogin,
  loginStep,
  type ProbeResult,
  type ProbeStep,
  runProbe,
} from "./helpers";

setDefaultTimeout(180_000);

let fixture: Fixture | undefined;

beforeAll(async () => {
  fixture = await installTestLogin();
});

afterAll(async () => {
  await fixture?.restore();
});

const statuses = (results: ProbeResult[]) => results.map((r) => r.status);

describe("BR-REC-38 sign-in is limited to 10 requests a minute per address", () => {
  let results: ProbeResult[];

  beforeAll(async () => {
    results = await runProbe(
      Array.from({ length: 12 }, () => loginStep()),
      { TRUST_PROXY_HOPS: "0" },
    );
  }, 150_000);

  test("BR-REC-38 the first 10 sign-ins in a minute are allowed", () => {
    expect(statuses(results).slice(0, 10)).toEqual(Array(10).fill(200));
  });

  test("BR-REC-38 the 11th sign-in in a minute is 429 RATE_LIMITED", () => {
    expect(results[10]?.status).toBe(429);
    expect(results[10]?.body).toMatchObject({
      success: false,
      code: "RATE_LIMITED",
    });
  });

  test("BR-REC-38 the 12th sign-in in the same minute is refused as well", () => {
    expect(results[11]?.status).toBe(429);
    expect(results[11]?.body?.code).toBe("RATE_LIMITED");
  });

  test("BR-REC-38 a refused sign-in sets no cookie", () => {
    expect(results[10]?.setCookie).toEqual([]);
  });
});

describe("BR-REC-38 with no proxy trusted (TRUST_PROXY_HOPS=0) X-Forwarded-For is ignored", () => {
  test("BR-REC-38 11 sign-ins, each with a different spoofed X-Forwarded-For, still hit the limit", async () => {
    const steps: ProbeStep[] = Array.from({ length: 11 }, (_, n) =>
      loginStep({ headers: { "X-Forwarded-For": `198.51.100.${n + 1}` } }),
    );
    const results = await runProbe(steps, { TRUST_PROXY_HOPS: "0" });

    expect(statuses(results).slice(0, 10)).toEqual(Array(10).fill(200));
    expect(results[10]?.status).toBe(429);
    expect(results[10]?.body?.code).toBe("RATE_LIMITED");
  });
});

describe("BR-REC-38 behind one trusted proxy (TRUST_PROXY_HOPS=1) the key is the address our proxy appended", () => {
  let results: ProbeResult[];

  beforeAll(async () => {
    const throughProxy = (xForwardedFor: string) =>
      loginStep({ headers: { "X-Forwarded-For": xForwardedFor } });
    results = await runProbe(
      [
        // The browser invents a new leftmost entry every time; our proxy appends the real address.
        ...Array.from({ length: 10 }, (_, n) =>
          throughProxy(`10.9.9.${n + 1}, 198.51.100.1`),
        ),
        throughProxy("10.9.9.99, 198.51.100.1"), // 11th from 198.51.100.1
        throughProxy("198.51.100.2"), // another address, first request
      ],
      { TRUST_PROXY_HOPS: "1" },
    );
  }, 150_000);

  test("BR-REC-38 spoofed left-hand entries do not give a fresh allowance: the 11th from one proxy-seen address is 429 RATE_LIMITED", () => {
    expect(statuses(results).slice(0, 10)).toEqual(Array(10).fill(200));
    expect(results[10]?.status).toBe(429);
    expect(results[10]?.body?.code).toBe("RATE_LIMITED");
  });

  test("BR-REC-38 the limit is per address: a different proxy-seen address is not limited", () => {
    expect(results[11]?.status).toBe(200);
  });
});

describe("BR-REC-38 refresh is limited to 30 requests a minute per address", () => {
  let results: ProbeResult[];

  beforeAll(async () => {
    const refresh: ProbeStep = {
      method: "POST",
      path: "/api/auth/refresh",
      useJar: true,
    };
    results = await runProbe(
      [loginStep(), ...Array.from({ length: 31 }, () => refresh)],
      { TRUST_PROXY_HOPS: "0" },
    );
  }, 150_000);

  test("BR-REC-38 the first 30 refreshes in a minute are allowed", () => {
    expect(results[0]?.status).toBe(200); // the sign-in they refresh
    expect(statuses(results).slice(1, 31)).toEqual(Array(30).fill(200));
  });

  test("BR-REC-38 the 31st refresh in a minute is 429 RATE_LIMITED", () => {
    expect(results[31]?.status).toBe(429);
    expect(results[31]?.body).toMatchObject({
      success: false,
      code: "RATE_LIMITED",
    });
  });
});
