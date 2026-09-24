// End-to-end tests: a real browser, a real web server, a real API, a real
// database. Playwright starts the servers; this starts the database and makes
// sure it is gone again afterwards.
import { createRequire } from "node:module";

import { compose, upAndWait } from "./lib/compose.mjs";
import { run, runPnpm } from "./lib/run.mjs";

const COMPOSE_FILE = "infra/compose/compose.e2e.yml";
const SERVICE = "postgres-e2e";

const passthrough = process.argv.slice(2);

// The database is torn down whatever happens, including a failed run and a
// Ctrl-C. Leaving a container behind is how the next run inherits the last
// one's rows. `process.on("exit")` permits only synchronous work, which is why
// the teardown is a synchronous spawn.
let cleaned = false;

function cleanup() {
  if (cleaned) return;
  cleaned = true;

  try {
    compose(COMPOSE_FILE, ["down", "--volumes"], { quiet: true });
  } catch {
    // Nothing useful to do while exiting, and an error here would mask the
    // real one.
  }
}

process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

try {
  // From scratch every time. These tests assert on seeded rows, and a database
  // carried over from a previous run has more than that.
  compose(COMPOSE_FILE, ["down", "--volumes"], { quiet: true });
  await upAndWait(COMPOSE_FILE, [SERVICE]);

  // Build once here so the .NET API and the web app are compiled before
  // Playwright launches them; its API webServer starts the built Host with
  // `dotnet run --no-build`. Migrations and seeds are run by that webServer
  // command, so the API cannot become reachable before its schema is in place.
  const built = runPnpm(["run", "build"]);
  if (built !== 0) process.exit(built);

  // Playwright's CLI is invoked with `node` rather than through `pnpm exec`.
  // `passthrough` is whatever the developer typed — `--grep "greets"` and the
  // like — and routing it through pnpm on Windows would mean routing it through
  // cmd.exe, which mangles spaces and parentheses. Spawning a real executable
  // keeps Node's own argument handling.
  const playwrightCli = createRequire(import.meta.url).resolve("@playwright/test/cli");

  process.exitCode = run([
    process.execPath,
    playwrightCli,
    "test",
    "--config",
    "tests/e2e/playwright.config.ts",
    ...passthrough,
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
