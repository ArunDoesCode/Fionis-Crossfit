// Child process used by the session tests when a rule depends on process-wide
// settings that cannot change inside the test process: NODE_ENV, TRUST_PROXY_HOPS,
// ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, and a rate-limit store that starts empty.
// The parent passes the requests as JSON in PROBE_STEPS; the answers go to stdout.
import { createApp } from "../../../src/app";
import {
  type ApiBody,
  PROBE_MARKER,
  type ProbeResult,
  type ProbeStep,
} from "./probe-types";

const steps = JSON.parse(process.env.PROBE_STEPS ?? "[]") as ProbeStep[];
const appOrigin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000")
  .origin;

const app = createApp();
const jar = new Map<string, string>();
const results: ProbeResult[] = [];

function rememberCookie(raw: string): void {
  const [pair = "", ...attributes] = raw.split(";").map((part) => part.trim());
  const at = pair.indexOf("=");
  if (at === -1) return;
  const name = pair.slice(0, at);
  const cleared = attributes.some(
    (attribute) => attribute.toLowerCase() === "max-age=0",
  );
  if (cleared) jar.delete(name);
  else jar.set(name, pair.slice(at + 1));
}

for (const step of steps) {
  const headers: Record<string, string> = { ...(step.headers ?? {}) };
  const origin = step.origin === undefined ? appOrigin : step.origin;
  if (origin !== null) headers.Origin = origin;

  const cookies: Record<string, string> = {
    ...(step.useJar ? Object.fromEntries(jar) : {}),
    ...(step.cookies ?? {}),
  };
  if (Object.keys(cookies).length > 0) {
    headers.Cookie = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  const init: RequestInit = { method: step.method ?? "GET", headers };
  if (step.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(step.body);
  }

  // The connecting address, as Bun.serve would hand it to the app.
  const res = await app.request(step.path, init, {
    requestIP: () => ({ address: "127.0.0.1", family: "IPv4", port: 40000 }),
  });
  const setCookie = res.headers.getSetCookie();
  for (const raw of setCookie) rememberCookie(raw);
  const body = (await res.json().catch(() => null)) as ApiBody | null;
  results.push({ status: res.status, setCookie, body });
}

await Bun.write(Bun.stdout, `\n${PROBE_MARKER}${JSON.stringify(results)}\n`);
// The shared DB client keeps the event loop alive.
process.exit(0);
