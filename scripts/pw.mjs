// Cross-platform wrapper for the Playwright browser-automation CLI.
// Sets the shared session name (works on Windows, macOS, and Linux, where an inline
// `VAR=value command` prefix is not portable) and forwards all arguments.
import { spawn } from "node:child_process";

const child = spawn("playwright-cli", process.argv.slice(2), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PLAYWRIGHT_CLI_SESSION: "app" },
});

child.on("exit", (code) => process.exit(code ?? 1));
