// Local database lifecycle. Usage: node scripts/db.mjs <up|down> [args]
//
// `up` blocks until the published port answers, so whatever runs next can
// connect. `down` forwards its extra arguments, which is how
// `pnpm run db:down -v` reaches Compose as `down -v`.
//
// Write it without a `--`. The filter below is for whoever still does: pnpm
// FORWARDS the separator rather than consuming it, so `pnpm run db:down -- -v`
// invokes this script as `db.mjs down -- -v` and, without the filter, called Compose with `down -- -v`.
// Compose ignores the stray argument, so the volume was never removed and nothing
// said so — which also made `db:refresh` quietly stop refreshing. Verified against
// pnpm 11.20.0: `pnpm run <script> -- -v` hands the script ["--", "-v"].
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compose, upAndWait } from "./lib/compose.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(repoRoot, "infra/compose/compose.yml");
const [, , command = "up", ...forwarded] = process.argv;
// See the note above: pnpm passes the separator through as a literal argument.
const rest = forwarded.filter((arg) => arg !== "--");

try {
  if (command === "up") {
    await upAndWait(composeFile, ["postgres"]);
    console.log("postgres is ready.");
  } else if (command === "down") {
    process.exitCode = compose(composeFile, ["down", ...rest]);
  } else {
    console.error(`Unknown db command "${command}". Use "up" or "down".`);
    process.exit(2);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
