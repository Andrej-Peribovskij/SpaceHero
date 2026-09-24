// Process helpers shared by the orchestration scripts.
import { spawn, spawnSync } from "node:child_process";

/**
 * Runs a real executable with its output attached to this process.
 *
 * No shell. `podman`, `dotnet` and `node` are ordinary executables, so Node
 * resolves and quotes them correctly on every platform. Use `runPnpm` for
 * pnpm, which is not.
 *
 * Returns the exit code rather than throwing, so callers that must clean up
 * before exiting are not forced to wrap every call in a try/finally.
 */
export function run(command, { env = {}, cwd, quiet = false, shell = false } = {}) {
  const [bin, ...args] = command;

  const result = spawnSync(bin, args, {
    cwd,
    shell,
    stdio: quiet ? "ignore" : "inherit",
    env: { ...process.env, ...env },
  });

  if (result.error?.code === "ENOENT") {
    throw new Error(`\`${bin}\` was not found on PATH.`);
  }
  if (result.error) throw result.error;

  // A child killed by a signal reports a null status. Treat that as failure
  // rather than success, which is what `status ?? 0` would do.
  return result.signal ? 1 : (result.status ?? 1);
}

/**
 * Runs pnpm.
 *
 * On Windows pnpm is a `.cmd` shim, and Node refuses to spawn `.cmd` without a
 * shell — that refusal is how CVE-2024-27980 was closed, so naming the shim
 * (`pnpm.cmd`) is necessary but not sufficient. With `shell: true` Node hands
 * the arguments to cmd.exe *unquoted*, which silently truncates anything
 * containing a space or a parenthesis, so they are quoted here.
 *
 * Only literal arguments go through this. Anything a developer types on the
 * command line is routed around pnpm entirely — see `test-e2e.mjs`, which
 * invokes Playwright's CLI with `node` for exactly that reason. cmd.exe cannot
 * round-trip an embedded double quote no matter how it is escaped.
 */
export function runPnpm(args, options = {}) {
  if (process.platform !== "win32") {
    return run(["pnpm", ...args], options);
  }

  return run(["pnpm.cmd", ...args.map(quoteForCmd)], { ...options, shell: true });
}

/**
 * As `runPnpm`, but asynchronous: returns the ChildProcess so the caller can
 * run it alongside others instead of blocking on it. Same shim handling, same
 * restriction to literal arguments.
 *
 * On Windows the child is cmd.exe rather than pnpm itself, so `kill` reaches
 * the shell and not the dev server underneath it. A caller that terminates
 * this process needs to end the whole tree — see `dev.mjs`.
 */
export function spawnPnpm(args, options = {}) {
  if (process.platform !== "win32") {
    return spawn("pnpm", args, { stdio: "inherit", ...options });
  }

  return spawn("pnpm.cmd", args.map(quoteForCmd), { stdio: "inherit", ...options, shell: true });
}

function quoteForCmd(argument) {
  if (argument === "") return '""';
  if (!/[\s"()<>|&^%!]/.test(argument)) return argument;
  return `"${argument}"`;
}

/** Runs a command and returns its stdout. */
export function capture(command, { env = {}, cwd } = {}) {
  const [bin, ...args] = command;

  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `\`${command.join(" ")}\` exited with ${result.status}.\n${result.stderr ?? ""}`,
    );
  }

  return result.stdout;
}
