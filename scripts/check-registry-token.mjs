// Refuse an install that is going to fail with a 401, and say why.
//
// Run by .pnpmfile.cjs's `preResolution` hook, before pnpm fetches anything. It
// used to be the root `preinstall` script, and that was too late: on pnpm 11
// with a frozen lockfile and a cold store, the root `preinstall` runs only
// after every package has been fetched, so on the one machine this exists for
// — a new one — the raw ERR_PNPM_FETCH_401 arrived first and this never ran.
// .pnpmfile.cjs has the detail. The logic, and why each state exists, is in
// ./lib/registry-token.mjs. Runnable on its own too:
// `node scripts/check-registry-token.mjs`.
//
// Passes without reading the user file when the checkout's own .npmrc has had a
// literal credential written into it (the committed one never has) — see
// projectHasInjectedAuth.
//
// Escape hatch: SCAFFOLD_SKIP_TOKEN_CHECK=1. Nothing here should be able to
// stop an install it does not understand.
//
// Prints no token, ever — only a path, a line number and a variable name.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkRegistryCredential, failureMessage, userNpmrcPath } from "./lib/registry-token.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path, encoding) => {
  try {
    return existsSync(path) ? readFileSync(path, encoding) : null;
  } catch {
    return null;
  }
};

const userPath = userNpmrcPath(process.env);
const result = checkRegistryCredential({
  env: process.env,
  projectNpmrc: read(join(repoRoot, ".npmrc"), "utf8"),
  userPath,
  userNpmrc: read(userPath),
});

if (result.verdict !== "fail") process.exit(0);

console.error(failureMessage(result, process.env));
process.exit(1);
