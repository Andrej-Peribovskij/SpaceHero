import { expect, test, type Page } from "@playwright/test";

/**
 * Test 4 of `docs/design-testing.md` §1: an administrator reaches both the canonical mount and
 * the prefixed one.
 *
 * This is the half of the routing suite the real stack cannot run.
 * `apps/web/src/infra/http/client.ts` attaches no bearer token, so a browser against the real
 * API is always anonymous and `GET /api/v1/me` always answers with no capabilities. The
 * integration suite mints a token because it *is* the HTTP client; a browser is not.
 *
 * So the session comes from the seam that already exists for designers:
 * `pnpm run design:preview` (`scripts/design-preview.mjs`) answers `/api/v1/me` with the one
 * capability the version gate reads, and 501s every other endpoint on purpose. Started for this
 * project by `../playwright.config.ts`, on ports of its own.
 *
 * Two consequences are worth stating before the assertions, because both look like bugs:
 *
 *  - There is no database and no API here. `/api/v1/widgets` answers 501, so the screens below
 *    render their error state. That is the seam being honest — a preview works because the
 *    version is mocked, not because previews are free — and an error state is still proof that
 *    the route matched, the guard allowed it, and the page component ran.
 *  - These tests assert on the URL first and the screen second. The screen is the same at both
 *    mounts by design: a version is not a copy of the app per mount. The URL is the only thing
 *    that distinguishes "reached the prefixed mount" from "was redirected off it".
 */

/** The stub's own address. It binds 127.0.0.1 explicitly, so this does too — `localhost` can
 * resolve to ::1, where nothing is listening. */
const PREVIEW_API_URL = "http://127.0.0.1:3300";

/** The pathname of wherever the page is now. */
function here(page: Page): string {
  return new URL(page.url()).pathname;
}

/** Waits for the address bar to settle. Polled, because every negative case here is a
 * client-side redirect and a single read after `goto` would race it. */
async function expectPath(page: Page, expected: string): Promise<void> {
  await expect.poll(() => here(page)).toBe(expected);
}

/**
 * The app rendered something of its own — a heading when data loads, or the alert when it does
 * not. Either means the route matched and the page component ran, which is what "reached this
 * mount" means. Anything less is a blank screen dressed up as a pass.
 */
async function expectAppRendered(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Widgets" }).or(page.getByRole("alert")),
  ).toBeVisible();
}

test("the synthetic session really is an administrator", async ({ request }) => {
  // Asserted directly, not inferred from the tests below. If the stub ever stopped granting the
  // capability, the rest of this file would still pass — it would just be testing an anonymous
  // browser being redirected, and reporting it as an administrator reaching both mounts. This
  // is the test that keeps the other ones meaningful.
  const me = await request.get(`${PREVIEW_API_URL}/api/v1/me`);

  expect(me.ok()).toBeTruthy();
  await expect(me.json()).resolves.toMatchObject({
    authenticated: true,
    capabilities: ["platform.design-versions.preview"],
  });
});

test("an administrator reaches the canonical mount", async ({ page }) => {
  await page.goto("/");

  await expectPath(page, "/");
  await expectAppRendered(page);
});

test("an administrator reaches the prefixed mount and stays on it", async ({ page }) => {
  // The same URL an anonymous visitor is redirected away from in `../flows/routing.spec.ts`.
  // That pair is the whole proof: same path, same build, different session, opposite outcome.
  // Either test on its own proves nothing about the gate.
  await page.goto("/v1.0.0");

  await expectPath(page, "/v1.0.0");
  await expectAppRendered(page);
});

test("a prefix no version claims goes to the root for an administrator too", async ({ page }) => {
  // `RequireAdministrator` is not what handles this. No version is registered under
  // `/design/v4.0.0`, so no route is mounted and the catch-all carries it onto the public
  // version — an administrator gets exactly what a visitor gets. That is correct, and it is
  // why the `/design/` test in `../flows/` cannot be read as proof of the gate.
  await page.goto("/design/v4.0.0/briefing");

  await expectPath(page, "/");
});
