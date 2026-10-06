/**
 * "Was this file run directly, or imported?" for the exporter and the fixture scripts, whose
 * tests import them.
 *
 * `path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)` is not enough: Node
 * resolves the module to its realpath and leaves argv[1] as typed, so through a junction or a
 * symlink the two differ and the script exits 0 having done nothing. (An 8.3 short name does
 * not break the comparison: Node keeps it on both sides.) Both sides go through
 * `realpathSync.native`, which resolves links. It fails on
 * some virtual volumes (RAM disks, cloud-sync drives); then the JavaScript `realpathSync` is
 * tried, and if neither resolves both paths, `path.resolve` decides and a "no" from it is
 * printed.
 *
 * A copy of the repository's `scripts/lib/main-module.mjs`, kept here because `process/design/`
 * imports nothing from outside itself. Change both together; see
 * `docs/tech-debt/duplicated-main-module-helper.md`.
 */

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
    // The first realpath that resolves both paths decides, yes or no.
    let failure = null;
    for (const canonical of [realpathSync.native, realpathSync]) {
        try {
            return canonical(self) === canonical(entry);
        } catch (error) {
            if (error.code !== "ENOENT") failure ??= error;
        }
    }
    // Neither could: path.resolve is the old comparison, so the answer is never
    // worse than it was, and only a "no" reached this way is worth a warning.
    if (resolve(self) === resolve(entry)) return true;
    if (failure) {
        console.warn(
            `isMainModule: could not resolve ${entry} (${failure.code ?? failure.message}); ` +
                "if it was run directly, its main was skipped",
        );
    }
    return false;
}
