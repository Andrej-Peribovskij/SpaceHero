// One-command local dev: bring up PostgreSQL, then run the backend API and the web
// app together. Cross-platform (no shell `&`); Ctrl+C tears everything down.
//
// The database comes up first (blocking, and it waits until its port answers) so the
// API has somewhere to connect before it starts.
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { upAndWait } from "./lib/compose.mjs";
import { spawnPnpm } from "./lib/run.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(repoRoot, "infra/compose/compose.yml");

// 1. Database first. Needs podman (the standard container engine).
try {
  await upAndWait(composeFile, ["postgres"]);
  console.log("postgres is ready.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// 2. Backend API and web app, concurrently. The web app is referenced by path rather
//    than by package name so this stays correct after `pnpm run rename`.
const children = [
  spawn("node", ["scripts/backend.mjs", "run"], { cwd: repoRoot, stdio: "inherit" }),
  spawnPnpm(["--filter", "./apps/web", "run", "dev"], { cwd: repoRoot }),
];

/**
 * Ends a child and everything it started.
 *
 * Both children are wrappers around the process that actually holds the port —
 * node around `dotnet run`, and on Windows cmd.exe around the web dev server as
 * well (see `spawnPnpm`). Windows has no signals, so `kill` terminates only the
 * wrapper and leaves the server behind, still bound to its port and invisible in
 * this terminal. `taskkill /T` takes the tree instead. Elsewhere SIGTERM reaches
 * the group and the wrappers forward it.
 */
function terminate(child) {
  // A pid is reused once the process is gone, so never signal a dead child.
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return;
  }

  spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    terminate(child);
  }
  process.exit(code);
}

// If either process exits, stop the other; forward Ctrl+C to both.
for (const child of children) {
  child.on("exit", (code) => shutdown(code ?? 0));
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
