// Node is the single orchestrator for the repo. Backend (.NET) commands are driven from
// here so `pnpm run …` stays the canonical interface. Every command runs with the working
// directory set to the service folder, so its self-contained .NET spine — global.json, the
// dotnet-tools manifest, and Directory.*.props — resolves naturally.
//
// Usage: node scripts/backend.mjs <command> [service] [-- extra args]
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const [, , command = "", service = "api", ...passthrough] = process.argv;
const serviceDir = join(repoRoot, "services", service);

// command -> dotnet argument list, relative to the service directory.
const commands = {
  build: ["build", "api.slnx"],
  test: ["test", "api.slnx"],
  // Formatting is the backend lint gate; --verify-no-changes fails on unformatted code.
  lint: ["format", "api.slnx", "--verify-no-changes"],
  format: ["format", "api.slnx"],
  run: ["run", "--project", "src/Host"],
  seed: ["run", "--project", "src/Host", "seed"],
  migrate: ["ef", "database", "update", "--project", "src/Persistence", "--startup-project", "src/Host"],
};

const args = commands[command];
if (!args) {
  console.error(`Unknown backend command "${command}". Known: ${Object.keys(commands).join(", ")}.`);
  process.exit(2);
}

// EF and the dev host read config from appsettings.Development.json unless DATABASE_URL is
// injected (Compose/CI). Default the environment to Development so a local `db:migrate`,
// `db:seed`, or `backend:dev` finds a connection string without extra setup; Compose/CI set
// ASPNETCORE_ENVIRONMENT and DATABASE_URL explicitly and those win.
const env = {
  ...process.env,
  ASPNETCORE_ENVIRONMENT: process.env.ASPNETCORE_ENVIRONMENT ?? "Development",
};

if (command === "migrate") {
  // `dotnet ef` builds the Host's service provider, so the app's console logger and the ef
  // tool's own reporter both narrate the migration and every line arrives twice. The
  // Console-scoped key mutes only the app's provider, leaving the tool as the single voice;
  // migration progress still prints.
  env["Logging__Console__LogLevel__Microsoft.EntityFrameworkCore"] ??= "None";

  // On an empty database EF runs `SELECT ... FROM "__EFMigrationsHistory"` before creating
  // that table, the SELECT throws, and EF logs it at Error under Database.Command before
  // falling back to "apply everything" — so a successful first migration would open with
  // `fail:` and read like a broken run. Silencing that one category hides the expected probe
  // failure, not a real one: a migration that genuinely fails still prints the Npgsql error
  // and exits non-zero through the ef tool, which this does not touch.
  env["Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command"] ??= "Critical";

  // `dotnet ef` is a local tool (services/api/.config/dotnet-tools.json); make sure it is
  // restored before the first migration on a fresh clone.
  const restore = spawnSync("dotnet", ["tool", "restore"], { cwd: serviceDir, stdio: "inherit", env });
  if ((restore.status ?? 1) !== 0) {
    process.exit(restore.status ?? 1);
  }
}

// Asynchronous so this process keeps a signal handler installed while dotnet runs.
// `spawnSync` would block it instead, and a blocked process handles nothing: the SIGTERM
// `dev.mjs` sends on Ctrl+C would kill this wrapper outright and leave `dotnet run` and the
// API it had started reparented to init, still holding the port. Forwarding the signal
// reaches `dotnet run`, which shuts the app down gracefully on its own.
const child = spawn("dotnet", [...args, ...passthrough], { cwd: serviceDir, stdio: "inherit", env });

child.on("error", (error) => {
  console.error(`Could not start dotnet: ${error.message}`);
  process.exit(1);
});

// POSIX only, and deliberately so. Windows has no signals: `kill` there ignores the name
// and calls TerminateProcess, so forwarding would replace the graceful stop with an abrupt
// one. Nothing is lost by staying out of the way, because both Windows paths already reach
// the whole tree — a console Ctrl+C raises CTRL_C_EVENT in every process attached to the
// console, and `dev.mjs` ends the tree with `taskkill /T`.
if (process.platform !== "win32") {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      // Ctrl+C signals the whole foreground group, so the child may already be gone by the
      // time this runs. A pid is reused once that happens, so never signal a dead child.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    });
  }
}

// A child killed by a signal reports a null code. Treat that as failure rather than
// success, which is what `code ?? 0` would do.
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
