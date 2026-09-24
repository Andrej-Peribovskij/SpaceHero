// The design-preview seam: requirement 6 in design-commands/README.md.
//
// A designer reviewing a `wired: false` version needs an administrator session and nothing
// else. Without this, the only way to get one is FULL_STACK_CMD — Podman, PostgreSQL, the
// .NET SDK, migrations and an environment file — before a single screen is ported, none of
// which can affect a version whose data is mocked by construction.
//
// The README's preferred shape was "seed a synthetic session into whatever store the app
// reads a session from". This app has no such store: `apps/web/src/infra/http/client.ts`
// attaches no token, and the session IS the answer to `GET /api/v1/me`. So the seam is one
// level out — a stub that answers the two deployment endpoints, with the frontend pointed at
// it through the runtime config it already reads. The property the README wanted is kept and
// is in fact stronger: there is no application code here at all, nothing conditional in the
// bundle, and nothing that could reach production. This file is the whole seam.
//
// THE HONESTY CLAUSE, MADE EXECUTABLE. A preview runs without the backend *because the
// version is mocked*, not because previews are cheap. Every path other than the two below
// answers 501 saying so, by name, so a wired version fails with the reason instead of an
// unexplained empty screen. The moment a version reads a real endpoint it is `wired: true`,
// it belongs to prompt 02 or 03, and the full stack comes back with it.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { spawnPnpm } from "./lib/run.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The capability the version gate asks for. Mirrors `DESIGN_VERSIONS_PREVIEW` in
 * apps/web/src/infra/auth/use-is-administrator.ts and `PlatformCapabilities` in the API —
 * three copies of one string, which is why each one is stated where a reviewer will see it.
 */
export const PREVIEW_CAPABILITY = "platform.design-versions.preview";

/**
 * Who the synthetic session says you are. Not a person's id and not a UUID: it should be
 * obvious in a log or a screenshot that this answer came from the preview stub.
 */
export const PREVIEW_SUBJECT = "design-preview";

/**
 * The port the stub listens on.
 *
 * Not 3000: that is the dev API's, and a designer previewing one version while the full stack
 * is up for another is an ordinary afternoon. Not 3100 either — tests/e2e/playwright.config.ts
 * starts its own API there, and a preview left running would be picked up by an E2E run as if
 * it were the real thing, which is the kind of green that means nothing.
 */
export const DEFAULT_PORT = 3200;

/**
 * How to start the frontend beside the stub.
 *
 * Unset `DESIGN_PREVIEW_WEB_PORT` — the ordinary case, a designer at a terminal — keeps vite's
 * own default port and vite's own behaviour when it is taken: step to the next free one and
 * print where it landed. That is right for a person and useless to a test runner, which has to
 * be told a URL before anything starts and will wait out its timeout on one that never answers.
 *
 * So a caller that needs a known address sets the variable, and gets `--strictPort` with it: a
 * port already in use then fails loudly instead of serving the preview somewhere nobody is
 * looking. `tests/e2e/playwright.config.ts` is that caller.
 *
 * `exec vite` rather than `run dev -- --port`: pnpm forwards the `--` to the script, and a flag
 * that arrives after one is read as a positional argument and silently ignored — the same trap
 * the E2E config's web server documents. With no port there is nothing to forward, so the
 * ordinary path stays `run dev` and keeps whatever that script grows into.
 */
export function webServerArgs(env) {
  const port = String(env.DESIGN_PREVIEW_WEB_PORT ?? "").trim();

  return port
    ? ["--filter", "./apps/web", "exec", "vite", "--port", port, "--strictPort"]
    : ["--filter", "./apps/web", "run", "dev"];
}

/**
 * What the dev API would answer for `publicUiVersion`, read from the same committed file it
 * reads. A preview that disagreed with `pnpm run dev` about which version is public would be
 * a preview of a deployment that does not exist.
 *
 * Absent or empty is not an error: the frontend falls back to the first registered production
 * version and says so in the console, which is the behaviour a real unconfigured deployment
 * has and worth seeing here too.
 */
export function readPublicUiVersion(appsettingsPath) {
  if (!existsSync(appsettingsPath)) return "";

  try {
    const settings = JSON.parse(readFileSync(appsettingsPath, "utf8"));
    const value = settings?.Public?.UiVersion;

    return typeof value === "string" ? value.trim() : "";
  } catch {
    // A settings file this script cannot parse is the API's problem to report, not this
    // script's to crash on. The fallback path is a supported state.
    return "";
  }
}

/**
 * Everything the browser needs to call a stub on a different origin than the dev server.
 *
 * `x-request-id` is the reason a preflight happens at all: `apiClient` sets it on every
 * call, and a non-simple header makes the browser ask first.
 */
export function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, x-request-id",
    "access-control-max-age": "600",
  };
}

/**
 * The stub's whole routing table.
 *
 * Returns `{ status, body }`; `body` is serialised as JSON when it is not null. Pure, so the
 * tests can assert the answers without a socket.
 */
export function route(method, pathname, publicUiVersion) {
  if (method === "OPTIONS") return { status: 204, body: null };

  if (method !== "GET") {
    return {
      status: 405,
      body: problem("Method not allowed", `The design preview answers GET, not ${method}.`, 405),
    };
  }

  if (pathname === "/api/v1/me") {
    return {
      status: 200,
      body: { authenticated: true, subjectId: PREVIEW_SUBJECT, capabilities: [PREVIEW_CAPABILITY] },
    };
  }

  if (pathname === "/api/v1/public-config") {
    return { status: 200, body: { publicUiVersion: publicUiVersion } };
  }

  return {
    status: 501,
    body: problem(
      "Not part of the design preview",
      `${pathname} is a real endpoint, and the design preview does not serve one. A version ` +
        "that reads it is wired, which makes it prompt 02's or prompt 03's, not prompt 04's — " +
        "run the full stack for that: pnpm run dev.",
      501,
    ),
  };
}

/** RFC 7807, the shape apps/web/src/infra/http/client.ts already parses on a failure. */
function problem(title, detail, status) {
  return { type: "about:blank", title, detail, status };
}

function main() {
  const port = Number(process.env.DESIGN_PREVIEW_API_PORT ?? DEFAULT_PORT);
  const publicUiVersion = readPublicUiVersion(
    join(repoRoot, "services/api/src/Host/appsettings.Development.json"),
  );

  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    const { status, body } = route(request.method ?? "GET", pathname, publicUiVersion);

    for (const [header, value] of Object.entries(corsHeaders())) response.setHeader(header, value);

    if (body === null) {
      response.writeHead(status);
      response.end();
      return;
    }

    response.setHeader("content-type", "application/json");
    response.writeHead(status);
    response.end(JSON.stringify(body));
  });

  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} is taken. Set DESIGN_PREVIEW_API_PORT to something else.`
        : String(error.message),
    );
    process.exit(1);
  });

  // Loopback only. This grants an administrator capability to anyone who asks, so it must not
  // be reachable from another machine even for the minutes it runs.
  server.listen(port, "127.0.0.1", () => {
    console.log(`design preview: a synthetic administrator on http://127.0.0.1:${port}`);
    console.log(`  GET /api/v1/me             -> ${PREVIEW_SUBJECT}, [${PREVIEW_CAPABILITY}]`);
    console.log(
      `  GET /api/v1/public-config  -> ${publicUiVersion || "(unset — the frontend will fall back and say so)"}`,
    );
    console.log("  anything else              -> 501, because the version would be wired");
  });

  // The frontend reads where its API is from /config.json, which the dev server fills from
  // API_URL. Pointing it here is the entire wiring — no flag, no mode, no application code.
  const web = spawnPnpm(webServerArgs(process.env), {
    cwd: repoRoot,
    env: { ...process.env, API_URL: `http://127.0.0.1:${port}` },
  });

  let shuttingDown = false;
  const shutdown = (code) => {
    if (shuttingDown) return;
    shuttingDown = true;

    server.close();
    terminate(web);
    process.exit(code);
  };

  web.on("exit", (code) => shutdown(code ?? 0));
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

/**
 * Ends the dev server and everything it started. Windows has no signals and the child is
 * cmd.exe around pnpm, so `kill` reaches the shell and leaves the server holding the port —
 * the same reason scripts/dev.mjs does this.
 */
function terminate(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return;
  }

  spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
