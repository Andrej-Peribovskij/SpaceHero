// Points git at the committed hooks in `.githooks/`. Run by the root `prepare`
// script, so a clone picks up the pre-push hook without a manual step.
//
// It never fails an install. `prepare` runs on every `pnpm install`, and not
// every install happens inside a git checkout: a deploy template or an image
// build can install from a copy of the tree with no `.git`, or on an agent with
// no `git` on PATH. A hook is a convenience for a developer's clone; an install
// that dies because one could not be registered would turn that convenience
// into an outage. So anything short of "git is here and this is a work tree"
// is reported and skipped, with exit 0.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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

function main() {
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  const verdict = decide(probe);
  if (!verdict.install) {
    console.log(`git:hooks: skipped, ${verdict.reason}`);
    return 0;
  }
  const set = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { encoding: "utf8" });
  if (set.error || set.status !== 0) {
    console.log(`git:hooks: skipped, git config failed: ${(set.stderr || String(set.error)).trim()}`);
    return 0;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());
