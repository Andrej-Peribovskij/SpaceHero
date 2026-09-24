// pnpm hooks. One, and it only checks: nothing here rewrites a manifest or the
// lockfile.
//
// preResolution: refuse an install that is going to fail with a 401, and say
// why — before pnpm fetches anything. The design system is served by GitHub
// Packages, which authenticates reads; without a token for npm.pkg.github.com
// the install dies with ERR_PNPM_FETCH_401 on a download URL, which does not say
// which line of which file is missing or wrong.
//
// WHY A PNPMFILE HOOK AND NOT `preinstall`, WHERE THIS CHECK USED TO BE:
// measured on pnpm 11.20 with a frozen lockfile and a cold store, the root
// `preinstall` runs only AFTER every package has been fetched and linked. On the
// one machine the check exists for — a new one, with nothing in the store — the
// fetch 401s first and the check never runs. With a warm store the fetch needs
// no token, so a `preinstall` check could only ever block an install that would
// have worked. `preResolution` runs after the lockfile is read and before
// anything is fetched, so it is the hook that can actually speak first. It also
// runs under `--ignore-scripts`, which apps/web/Dockerfile installs with.
//
// The check itself is scripts/check-registry-token.mjs (logic and tests in
// scripts/lib/registry-token.mjs). It reads only files and never prints a
// token. SCAFFOLD_SKIP_TOKEN_CHECK=1 skips it.
//
// KEEP THIS FILE SMALL AND STABLE: pnpm records its checksum in pnpm-lock.yaml
// (`pnpmfileChecksum`), so every edit here is a lockfile change as well.
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

module.exports = {
  hooks: {
    preResolution() {
      const result = spawnSync(process.execPath, [join(__dirname, "scripts", "check-registry-token.mjs")], {
        stdio: "inherit",
      });
      // A check that could not run is not a failed check: never stop an install over it.
      if (result.error || result.status === null) return;
      if (result.status !== 0) {
        throw new Error("no usable GitHub Packages credential — see the message above (docs/design-system.md).");
      }
    },
  },
};
