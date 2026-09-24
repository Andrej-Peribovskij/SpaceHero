// Backend tests against a real PostgreSQL.
//
// `pnpm run test` runs the same xUnit suites without a database: the DB-backed
// facts skip themselves when DATABASE_URL is unset (see
// `RequiresDatabaseFactAttribute`). This script is what makes them run — it
// starts a dedicated PostgreSQL on 5433, applies the migrations, and hands the
// connection string to `dotnet test`.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compose, upAndWait } from "./lib/compose.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(repoRoot, "infra/compose/compose.test.yml");
const DATABASE_URL = "postgresql://app:app@localhost:5433/app_test";

let code = 1;

try {
  await upAndWait(composeFile, ["postgres-test"]);

  // Passed as environment rather than as a `VAR=value` command prefix, which is
  // shell syntax cmd.exe does not have.
  code = backend("migrate");
  if (code === 0) {
    code = backend("test");
  }
} catch (error) {
  console.error(error.message);
} finally {
  // Unconditional, so a failing suite does not leave the database running.
  compose(composeFile, ["down", "--volumes"], { quiet: true });
}

process.exitCode = code;

function backend(command) {
  const result = spawnSync(process.execPath, ["scripts/backend.mjs", command], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL },
  });

  return result.signal ? 1 : (result.status ?? 1);
}
