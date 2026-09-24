import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser, a real web server, a real API, a real
 * database.
 *
 * This is the only suite in the repository where nothing is stubbed on this side
 * of the network, which is the point of it. A missing CORS header, a stylesheet
 * that generates no classes, a route the app calls but the API does not serve —
 * every other suite replaces the thing that would be broken.
 */

/** Its own ports, so a run never collides with — or silently reuses — the
 * `pnpm run dev` servers on 3000 and 5173 and their database. */
const API_PORT = 3100;
const WEB_PORT = 5273;

const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * The design-preview project's own pair, and again nobody else's.
 *
 * `scripts/design-preview.mjs` defaults to 3200 for its stub and vite's own default for the
 * frontend, which is what a designer running `pnpm run design:preview` by hand gets. A suite
 * that reused those would fight a preview somebody left open — and, worse, could pass against
 * it. So this run names its own two and `--strictPort` makes a collision a failure rather than
 * a quiet move to the next port.
 */
const PREVIEW_API_PORT = 3300;
const PREVIEW_WEB_PORT = 5373;

const PREVIEW_WEB_URL = `http://localhost:${PREVIEW_WEB_PORT}`;

/** Started by `scripts/test-e2e.mjs` on 5434. Never the dev or integration one. */
const DATABASE_URL = "postgresql://app:app@localhost:5434/app_e2e";

export default defineConfig({
  testDir: "./flows",
  // One worker against one database. These share seeded rows, and a second
  // worker is a race dressed up as parallelism.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,

  // Both relative to this file, so the paths are the same wherever the command
  // was run from — including the CI step that uploads the report.
  outputDir: "./test-results",
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "./playwright-report" }]]
    : [["list"]],

  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // The real stack: a browser that is always anonymous, because
    // `apps/web/src/infra/http/client.ts` attaches no token and `GET /api/v1/me` therefore
    // answers with no capabilities. That is not a limitation to work around here — it is the
    // visitor whose experience most of this suite is about.
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },

    // The one thing the real stack cannot give a browser: an administrator. There is no login
    // flow to drive and no token to mint, so the session comes from the seam that already
    // exists for designers — `scripts/design-preview.mjs`, which answers `/api/v1/me` as a
    // synthetic administrator and 501s everything else by design.
    //
    // Its own testDir, not a grep or a tag, so that "which tests need an administrator" is
    // answered by where a file sits rather than by remembering to annotate it.
    {
      name: "design-preview",
      testDir: "./design-preview",
      use: { ...devices["Desktop Chrome"], baseURL: PREVIEW_WEB_URL },
    },
  ],

  webServer: [
    {
      // Migrations and seeds run here rather than in `globalSetup` so the schema
      // cannot lose a race with the server that needs it: the API is not
      // reachable until the command that migrates has finished. The .NET service
      // is already compiled by `scripts/test-e2e.mjs` (`pnpm run build`), so the
      // server starts `--no-build`; `--no-launch-profile` keeps launchSettings
      // from overriding the URL and environment set here.
      command:
        "node ../../scripts/backend.mjs migrate && node ../../scripts/backend.mjs seed && dotnet run --project src/Host --no-build --no-launch-profile",
      cwd: "../../services/api",
      url: `${API_URL}/health/ready`,
      // Never reuse. A server already on this port was started by something
      // else, and the something else knows a different database.
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      // .NET config keys, so double-underscore for nesting. DATABASE_URL is read
      // directly; everything else binds a section.
      env: {
        DATABASE_URL,
        ASPNETCORE_URLS: API_URL,
        ASPNETCORE_ENVIRONMENT: "Development",
        // The browser is the client, so this has to name the web server's origin
        // exactly. Getting it wrong is one of the failures this suite exists to
        // catch, which is why it is not `*`.
        Cors__AllowedOrigins__0: WEB_URL,
        // Throwaway, and at least 32 chars to satisfy the signing-key validator.
        Jwt__Secret: "e2e-only-signing-secret-0123456789",
        // The API logs every request at info, and Playwright interleaves that
        // with the test output. Both keys are needed: appsettings.Development
        // raises `Microsoft.AspNetCore` on its own, and the more specific key
        // wins over `Default`. Warnings and above still come through, so a
        // server in real trouble is still legible.
        Logging__LogLevel__Default: "Warning",
        "Logging__LogLevel__Microsoft.AspNetCore": "Warning",
      },
    },
    {
      // `exec vite` rather than `run dev -- --port`: pnpm forwards the `--` to
      // the script, and a flag that arrives after one is read as a positional
      // argument and silently ignored.
      command: `pnpm --filter ./apps/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: "../..",
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      // Read by `vite.config.ts`, which serves it to the browser as
      // `/config.json`. This is how the app learns where its API is.
      env: { API_URL },
    },
    {
      // The administrator seam. One command starts both halves: the stub that answers
      // `/api/v1/me` as an administrator, and a second vite pointed at it through the same
      // `/config.json` the app already reads. No application code, no build flag, nothing
      // conditional in the bundle — which is what makes it usable as a test fixture without
      // the fixture becoming a thing that can ship.
      //
      // Started for every run, including one that only touches `flows/`. Two extra processes,
      // a few seconds, and the alternative is a per-project web server, which Playwright does
      // not have.
      command: "pnpm run design:preview",
      cwd: "../..",
      url: PREVIEW_WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DESIGN_PREVIEW_API_PORT: String(PREVIEW_API_PORT),
        DESIGN_PREVIEW_WEB_PORT: String(PREVIEW_WEB_PORT),
      },
    },
  ],
});
