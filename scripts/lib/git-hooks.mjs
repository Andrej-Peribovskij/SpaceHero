// The hook registration behind `scripts/git-hooks.mjs`, kept here so a test can
// import it. The entry point runs it unconditionally: an "am I the main
// module" guard compares paths, and through a junction, a symlink, a subst
// drive or an 8.3 short name the comparison fails, `prepare` installs no hooks
// and says nothing.
//
// It never fails an install. `prepare` runs on every `pnpm install`, and not
// every install happens inside a git checkout: a deploy template or an image
// build can install from a copy of the tree with no `.git`, or on an agent with
// no `git` on PATH. A hook is a convenience for a developer's clone; an install
// that dies because one could not be registered would turn that convenience
// into an outage. So anything short of "git is here and this is a work tree"
// is reported and skipped, with exit 0.
import { spawnSync } from "node:child_process";

/**
 * What to do, from what git answered. Pure, so the decision is testable
 * without a git binary or a repository.
 * @param {{ error?: unknown, status: number | null, stdout?: string }} probe
 *   the result of `git rev-parse --is-inside-work-tree`
 */
export function decide(probe) {
  if (probe.error) return { install: false, reason: "git is not runnable here" };
  if (probe.status !== 0 || String(probe.stdout ?? "").trim() !== "true") {
    return { install: false, reason: "not inside a git work tree" };
  }
  return { install: true };
}

/**
 * What to say once `core.hooksPath` is written, from the value git reads back.
 * The write goes to the repository's shared config, and a more specific scope
 * — a worktree's own config, the environment, the command line — wins over it.
 * Pure, like `decide`.
 * @param {{ error?: unknown, status: number | null, stdout?: string }} readBack
 *   the result of `git config --show-origin --get core.hooksPath`
 * @returns {string | null} a notice, or null when git uses `.githooks`
 */
export function overrideNotice(readBack) {
  if (readBack.error || readBack.status !== 0) return null;
  const line = String(readBack.stdout ?? "").trim();
  const tab = line.indexOf("\t");
  const origin = tab === -1 ? "" : line.slice(0, tab);
  const value = tab === -1 ? line : line.slice(tab + 1);
  if (value === ".githooks") return null;
  return `git:hooks: set core.hooksPath to .githooks, but git uses ${value}${origin ? ` from ${origin}` : ""}`;
}

/**
 * Points the work tree containing the current directory at `.githooks/`.
 * Reports and returns on anything that goes wrong; never throws, never fails.
 */
export function installHooks() {
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  const verdict = decide(probe);
  if (!verdict.install) {
    console.log(`git:hooks: skipped, ${verdict.reason}`);
    return;
  }
  const set = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { encoding: "utf8" });
  if (set.error || set.status !== 0) {
    console.log(`git:hooks: skipped, git config failed: ${(set.stderr || String(set.error)).trim()}`);
    return;
  }
  const notice = overrideNotice(
    spawnSync("git", ["config", "--show-origin", "--get", "core.hooksPath"], { encoding: "utf8" }),
  );
  if (notice) console.log(notice);
}
