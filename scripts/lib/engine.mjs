// Which container engine runs the local stacks.
//
// Podman is the standard (see ADR-0002). The compose files are Compose
// specification and `podman compose` runs the same implementation Docker does,
// so nothing here needs Docker's engine. A different command — `podman-compose`,
// a path to a specific binary, a wrapper of your own, or Docker on a hosted
// runner that only ships it — is reachable through COMPOSE_COMMAND.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let resolved;

/** The argv prefix that runs Compose, e.g. `["podman", "compose"]`. */
export function composeCommand() {
  resolved ??= resolveEngine();
  return resolved;
}

/**
 * The engine binary itself, for the commands that are not Compose — `build`.
 *
 * Derived from the same resolution as `composeCommand`, so one override
 * (COMPOSE_COMMAND) moves both: `docker compose` implies `docker build`.
 */
export function engineBinary() {
  return composeCommand()[0];
}

/**
 * Environment the engine needs.
 *
 * `podman compose` is a wrapper that hands the work to an external Compose
 * provider, and it announces that in ANSI on every single call, ahead of the
 * command's own output. Suppressing it keeps machine-readable output readable.
 */
export function engineEnv() {
  return { PODMAN_COMPOSE_WARNING_LOGS: "false" };
}

/**
 * A hint for a failure that the engine's own error text usually does not
 * explain, printed alongside it rather than in place of it.
 */
export function troubleshooting() {
  return [
    "",
    "If that failed before it reached the containers, check:",
    "  - the machine is running:  podman machine start",
    "  - a compose provider is installed. `podman compose` needs Docker",
    "    Compose v2 on PATH; Podman Desktop can install it. Point at a",
    "    specific one with PODMAN_COMPOSE_PROVIDER=<path>.",
  ].join("\n");
}

function resolveEngine() {
  // COMPOSE_COMMAND is a full argv and the escape hatch for anything the podman
  // default cannot express — `podman-compose`, a path to a specific binary, a
  // wrapper of your own, or `docker compose` on a hosted runner.
  // The environment wins, then the repository-root .env, which is where
  // scripts/init.mjs records the answer to its container-engine question. A file
  // is what survives opening a new shell; the variable is what overrides it for
  // one command.
  const override = (process.env.COMPOSE_COMMAND ?? "").trim() || readRootEnv("COMPOSE_COMMAND");
  if (override) {
    return override.split(/\s+/);
  }

  if (!hasCompose()) {
    throw new Error(
      "podman is the standard container engine (ADR-0002), but `podman compose version`\n" +
        "failed. podman delegates compose to an external provider: install Docker Compose v2\n" +
        "(Podman Desktop offers it) or set PODMAN_COMPOSE_PROVIDER to its path. Set\n" +
        "COMPOSE_COMMAND to name a different command outright, e.g. `docker compose`.",
    );
  }

  return ["podman", "compose"];
}

// `podman compose` is the only podman form used by default. It is a thin wrapper
// that points an existing Compose v2 at the podman socket, so a flag means the
// same thing it does under Docker. `podman-compose`, the separate Python
// reimplementation, does not accept `config --format json` (which the readiness
// probe depends on) and is reachable only through COMPOSE_COMMAND.
function hasCompose() {
  const result = spawnSync("podman", ["compose", "version"], {
    stdio: "ignore",
    env: { ...process.env, PODMAN_COMPOSE_WARNING_LOGS: "false" },
  });

  return result.status === 0;
}


/**
 * One value out of the repository-root .env, or "".
 *
 * Deliberately not a dotenv implementation: no `export` syntax, no
 * interpolation, no multi-line values. It reads the handful of settings
 * scripts/init.mjs writes there, and anything more expressive belongs in the
 * shell, where this file already looks first.
 */
function readRootEnv(key) {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
  if (!existsSync(path)) return "";

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0 && trimmed.slice(0, eq).trim() === key) {
      return trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }

  return "";
}
