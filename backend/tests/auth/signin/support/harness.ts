/**
 * Shared hooks for the sign-in test files: one API server per file, a fresh
 * TEST login and a zeroed lock before every test, TEST data removed after.
 */
import { afterAll, beforeAll, beforeEach, setDefaultTimeout } from "bun:test";

import {
  type ApiResponse,
  type ApiServer,
  expectError,
  startApi,
} from "./api-server";
import {
  installAccount,
  removeAuthAuditSince,
  removeTestAccounts,
  resetLock,
  suiteStart,
  TEST_PASSWORD,
  TEST_USERNAME,
  type TestAccount,
  WRONG_PASSWORD,
} from "./fixtures";

export type Harness = {
  /** The running API server (replaced by `restartApi`). */
  readonly api: ApiServer;
  /** The login created for the current test (`account: false` harnesses have none). */
  readonly account: TestAccount;
  /** Start of this file's run; scopes change-log rows. */
  readonly since: Date;
  restartApi(): Promise<ApiServer>;
};

export function useHarness(
  options: { server?: boolean; account?: boolean } = {},
): Harness {
  const withServer = options.server ?? true;
  const withAccount = options.account ?? true;
  let api: ApiServer | undefined;
  let account: TestAccount | undefined;
  let since = suiteStart();

  setDefaultTimeout(30_000);

  beforeAll(async () => {
    since = suiteStart();
    await removeTestAccounts();
    if (withServer) api = await startApi();
  }, 60_000);

  beforeEach(async () => {
    account = withAccount ? await installAccount() : undefined;
    if (!withAccount) await removeTestAccounts();
    await resetLock();
  });

  afterAll(async () => {
    await api?.stop();
    await removeTestAccounts();
    // The one-row lock store stays (zeroed, as a fresh install leaves it); never deleted.
    await resetLock();
    await removeAuthAuditSince(since);
  }, 60_000);

  return {
    get api() {
      if (!api) throw new Error("API server is not running");
      return api;
    },
    get account() {
      if (!account) throw new Error("no test account in this harness");
      return account;
    },
    get since() {
      return since;
    },
    async restartApi() {
      await api?.stop();
      api = await startApi();
      return api;
    },
  };
}

/** `count` wrong sign-ins, one after another, each from its own network address. */
export async function wrongLogins(
  api: ApiServer,
  count: number,
  who: { username?: string; password?: string } = {},
): Promise<ApiResponse[]> {
  const out: ApiResponse[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(
      await api.login({
        username: who.username ?? TEST_USERNAME,
        password: who.password ?? WRONG_PASSWORD,
      }),
    );
  }
  return out;
}

export async function wrongLogin(
  api: ApiServer,
  who: { username?: string; password?: string } = {},
): Promise<ApiResponse> {
  const [res] = await wrongLogins(api, 1, who);
  if (!res) throw new Error("no response");
  return res;
}

export function expectAllInvalidCredentials(responses: ApiResponse[]): void {
  for (const res of responses) expectError(res, 401, "INVALID_CREDENTIALS");
}

/** Five wrong tries: the first four and the fifth are all 401; the lock starts on the fifth. */
export async function lockTheLogin(api: ApiServer): Promise<void> {
  expectAllInvalidCredentials(await wrongLogins(api, 5));
}

export async function rightLogin(api: ApiServer): Promise<ApiResponse> {
  return api.login({ username: TEST_USERNAME, password: TEST_PASSWORD });
}
