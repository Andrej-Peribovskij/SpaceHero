// "Was this file run directly, or imported?" for a script whose test imports
// it. Comparing `import.meta.url` with `process.argv[1]` is not enough: Node
// resolves the module to its realpath and leaves argv[1] as typed, so through
// a junction, a symlink, a subst drive or an 8.3 short name the two differ, the
// script skips its main and exits 0 having done nothing.
//
// Both sides go through `realpathSync.native`, which resolves all four. The
// JavaScript `realpathSync` follows links but keeps an 8.3 name as it is.
// `import.meta.main` would do this too, but not on every Node CI runs.
//
// A script with nothing a test needs to import does not need this: its entry
// point can run unconditionally, as `git-hooks.mjs` and `check-links.mjs` do.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {string} moduleUrl the caller's `import.meta.url`
 * @param {string | undefined} [entry] the path Node was asked to run
 */
export function isMainModule(moduleUrl, entry = process.argv[1]) {
  if (!entry) return false;
  try {
    return realpathSync.native(fileURLToPath(moduleUrl)) === realpathSync.native(entry);
  } catch {
    return false;
  }
}
