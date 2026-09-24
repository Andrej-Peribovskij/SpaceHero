// Build a service or app container image.
// Usage: node scripts/image.mjs <web|api>
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { engineBinary } from "./lib/engine.mjs";
import { run } from "./lib/run.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const targets = {
  // The web image builds from the repo root (needs the root manifests + workspaces).
  // It installs the design system from GitHub Packages, so its build needs a
  // registry token — passed as a BuildKit secret, never as a build argument.
  web: { context: ".", dockerfile: "apps/web/Dockerfile", tag: "my-app-web", needsRegistryToken: true },
  // The API image builds from its self-contained service directory.
  api: { context: "services/api", dockerfile: "services/api/Dockerfile", tag: "my-app-api" },
};

const [, , name] = process.argv;
const target = targets[name];
if (!target) {
  console.error(`Unknown image "${name ?? ""}". Known: ${Object.keys(targets).join(", ")}.`);
  process.exit(2);
}

// Checked here rather than inside the build: a missing token is a setup problem
// with a one-line fix, and saying so costs a second instead of a whole build.
const secretArgs = [];
if (target.needsRegistryToken) {
  if (!process.env.NODE_AUTH_TOKEN) {
    console.error(
      [
        "NODE_AUTH_TOKEN is not set, and the web image cannot install the design system without it.",
        "",
        "The design system is published to GitHub Packages, which authenticates reads as well as",
        "writes. Set a token with the read:packages scope and build again:",
        "",
        "  export NODE_AUTH_TOKEN=<token>   # PowerShell: $env:NODE_AUTH_TOKEN = \"<token>\"",
        "",
        "See docs/design-system.md for how to get one.",
      ].join("\n"),
    );
    process.exit(2);
  }

  // `env=` hands the value straight to the builder, so it never reaches the
  // process list or a file on disk. Supported by both podman build and buildx.
  secretArgs.push("--secret", "id=node_auth_token,env=NODE_AUTH_TOKEN");
}

try {
  process.exitCode = run(
    [engineBinary(), "build", "-f", target.dockerfile, ...secretArgs, "-t", target.tag, target.context],
    { cwd: repoRoot },
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
