/**
 * "Was this file run directly, or imported?" for the exporter and the fixture scripts, whose
 * tests import them.
 *
 * `path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)` is not enough: Node
 * resolves the module to its realpath and leaves argv[1] as typed, so through a junction, a
 * symlink, a subst drive or an 8.3 short name the two differ and the script exits 0 having done
 * nothing. Both sides go through `realpathSync.native`, which resolves all four.
 *
 * A copy of the repository's `scripts/lib/main-module.mjs`, kept here because `process/design/`
 * imports nothing from outside itself. Change both together.
 */

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
