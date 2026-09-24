// Compose calls, engine-agnostic.
//
// Everything here is Compose specification surface — `up --wait`, `down`,
// `config --format json`. Deliberately absent is `inspect`: reading
// `.State.Health.Status` out of a Go template is the one call whose output
// shape is defined by the engine rather than by Compose, and it answers a
// question (is the container healthy on its own network?) that is weaker than
// the one that matters (does the published port answer on this host?).
import { composeCommand, engineEnv, troubleshooting } from "./engine.mjs";
import { capture, run } from "./run.mjs";
import { waitForPort } from "./wait-for-port.mjs";

const DEFAULT_TIMEOUT_SECONDS = Number(process.env.COMPOSE_WAIT_TIMEOUT_SECONDS ?? 60);

/** Runs a compose subcommand against `composeFile`. Returns the exit code. */
export function compose(composeFile, args, options = {}) {
  return run([...composeCommand(), "-f", composeFile, ...args], {
    env: engineEnv(),
    ...options,
  });
}

/** As `compose`, but fails loudly and adds an engine hint to the message. */
export function composeOrThrow(composeFile, args, options = {}) {
  const code = compose(composeFile, args, options);
  if (code !== 0) {
    throw new Error(
      `\`compose ${args.join(" ")}\` failed with exit code ${code}.${troubleshooting()}`,
    );
  }
}

/**
 * Starts `services` and returns once each one's published ports answer.
 *
 * Two checks, because neither alone is sufficient. `--wait` blocks on the
 * healthchecks in the compose file, which is what distinguishes a Postgres
 * that has finished initdb from one that merely accepts TCP. The port probe
 * that follows covers the gap between a healthy container and a working port
 * mapping on the host: under rootless podman the forwarder is programmed
 * separately from the container, and on Windows and macOS there is a machine
 * hop on top of that.
 */
export async function upAndWait(composeFile, services, { timeoutSeconds } = {}) {
  const timeout = timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  composeOrThrow(composeFile, [
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    String(timeout),
    ...services,
  ]);

  const deadline = Date.now() + timeout * 1000;

  for (const service of services) {
    for (const port of publishedPorts(composeFile, service)) {
      await waitForPort(port, { deadline, label: service });
    }
  }
}

/** The host ports `service` publishes, read from the resolved compose config. */
export function publishedPorts(composeFile, service) {
  const config = JSON.parse(
    capture([...composeCommand(), "-f", composeFile, "config", "--format", "json"], {
      env: engineEnv(),
    }),
  );

  const ports = config.services?.[service]?.ports ?? [];

  return ports
    .map((port) => Number(port.published))
    .filter((port) => Number.isInteger(port) && port > 0);
}
