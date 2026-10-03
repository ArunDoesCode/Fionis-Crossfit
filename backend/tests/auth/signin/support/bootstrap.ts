/**
 * Runs `backend/scripts/bootstrap-admin.ts` as a child process against the
 * *_test database (contract: the script uses the `DATABASE_URL` of its own
 * process). No TTY: stdin is closed, so a missing value cannot be prompted.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { BACKEND_DIR, childEnv } from "./api-server";

export const BOOTSTRAP_SCRIPT = join(
  BACKEND_DIR,
  "scripts",
  "bootstrap-admin.ts",
);

export type ScriptResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** stdout + stderr, for "never prints the password" checks */
  output: string;
};

export async function runBootstrap(args: string[]): Promise<ScriptResult> {
  if (!existsSync(BOOTSTRAP_SCRIPT)) {
    // A missing file would make every "exit 1" assertion pass for the wrong reason.
    throw new Error(
      "backend/scripts/bootstrap-admin.ts does not exist yet (built in slice 1)",
    );
  }
  const proc = Bun.spawn(["bun", "--no-env-file", BOOTSTRAP_SCRIPT, ...args], {
    cwd: BACKEND_DIR,
    env: childEnv(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr, output: `${stdout}\n${stderr}` };
}
