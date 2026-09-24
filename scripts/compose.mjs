// Compose passthrough for the full local stack (database + built API image).
// Usage: node scripts/compose.mjs <compose args...>   (e.g. up -d --build)
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compose } from "./lib/compose.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(repoRoot, "infra/compose/compose.yml");

try {
  process.exitCode = compose(composeFile, process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
