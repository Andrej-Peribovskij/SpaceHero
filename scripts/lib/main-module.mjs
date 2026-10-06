// "Was this file run directly, or imported?" for a script whose test imports
// it. Comparing `import.meta.url` with `process.argv[1]` is not enough: Node
// resolves the module to its realpath and leaves argv[1] as typed, so through
// a junction or a symlink the two differ, the script skips its main and exits
// 0 having done nothing. (An 8.3 short name does not break the comparison:
// Node keeps it on both sides.)
//
// Both sides go through `realpathSync.native`, which resolves links and also
// normalises 8.3 names and subst drives. `realpathSync.native` fails on some virtual volumes (RAM disks, cloud-sync
// drives); then the JavaScript one is tried, then `path.resolve`, and a
// failure that still leaves the answer "no" is printed, not swallowed.
// `import.meta.main` would do this too, but not on every Node CI runs.
//
// A script with nothing a test needs to import does not need this: its entry
// point can run unconditionally, as `git-hooks.mjs` and `check-links.mjs` do.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string} moduleUrl the caller's `import.meta.url`
 * @param {string | undefined} [entry] the path Node was asked to run
 */
export function isMainModule(moduleUrl, entry = process.argv[1]) {
  if (!entry) return false;
  const self = fileURLToPath(moduleUrl);
  // Weakest last: path.resolve is the old comparison, so a failure above
  // never makes the answer worse than it was.
  let failure = null;
  for (const canonical of [realpathSync.native, realpathSync, resolve]) {
    try {
      if (canonical(self) === canonical(entry)) return true;
    } catch (error) {
      if (error.code !== "ENOENT") failure ??= error;
    }
  }
  if (failure) {
    console.warn(
      `isMainModule: could not resolve ${entry} (${failure.code ?? failure.message}); ` +
        "if it was run directly, its main was skipped",
    );
  }
  return false;
}
