import { expect, test, type Page } from "@playwright/test";

/**
 * The acceptance criterion for the dual-mount architecture — `docs/design-testing.md` §1, the
 * anonymous half. The administrator half is in `../design-preview/`, which needs a session this
 * browser cannot have.
 *
 * Why a browser and not `apps/web/src/versions/routing.test.tsx`, which covers the same rules in
 * jsdom: the ESLint rule bans hardcoded prefix *literals*, and the component test asserts on the
 * router's decisions rather than on a URL. Neither sees a path assembled at runtime from a
 * variable, or a redirect read back out of storage. Only an address bar does.
 */

/**
 * A version-shaped path: what must never appear in an ordinary visitor's URL.
 *
 * Mirrors `VERSION_PREFIX` in `apps/web/src/versions/registry-core.ts` and the selector in
 * `eslint.config.mjs`. Deliberately a third copy rather than an import: the point of this test
 * is to agree with neither of them and check the outcome.
 */
const VERSION_SHAPED = /^\/(v\d|design\/)/;

/** The pathname and query of wherever the page is now. */
function here(page: Page): string {
  const url = new URL(page.url());

  return `${url.pathname}${url.search}`;
}

/**
 * Waits for the address bar to settle on `expected`.
 *
 * Polled, never read once. Every assertion in this file follows a client-side redirect, and a
 * synchronous read after `goto` races it: the test would pass or fail on how quickly React
 * rendered, which is the definition of a flake.
 */
async function expectPath(page: Page, expected: string): Promise<void> {
  await expect.poll(() => here(page)).toBe(expected);
}

/**
 * Walks the public app the way a visitor does — following the links it actually renders — and
 * returns every URL the main frame ever held, not just the ones asked for.
 *
 * Recording every navigation is the point. A redirect *into* a prefixed URL and straight back
 * out leaves no trace in the final address bar and is still a leak: the visitor saw it.
 *
 * Today the walk covers one screen, because the template ships one. It is written as a walk
 * rather than a single `goto` so that it grows by itself: prompt 01 adds pages under
 * `src/pages/`, prompt 02 promotes them into a production version, and the moment one renders a
 * link this test follows it without being edited.
 */
async function walkPublicApp(page: Page, maxPages = 10): Promise<string[]> {
  const seen: string[] = [];

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;

    const url = new URL(frame.url());
    if (url.protocol === "about:") return;

    seen.push(`${url.pathname}${url.search}`);
  });

  const visited = new Set<string>();
  const queue = ["/"];

  while (queue.length > 0 && visited.size < maxPages) {
    const next = queue.shift();
    if (next === undefined || visited.has(next)) continue;
    visited.add(next);

    await page.goto(next);
    // Wait for React to have rendered something — any screen, not a particular one, so this
    // keeps working as pages are added. Without it the walk would read links off a blank page.
    await expect(page.locator("#root")).not.toBeEmpty();

    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).getAttribute("href") ?? ""),
      );

    for (const href of hrefs) {
      // Same-origin, in-app links only. An external link is not this architecture's problem,
      // and following one would make the suite depend on the internet.
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      if (!visited.has(href)) queue.push(href);
    }
  }

  return seen;
}

/* Test 1 — the one that earns the servers it starts. */
test("a visitor walks the public app and the URL never carries a version prefix", async ({
  page,
}) => {
  const seen = await walkPublicApp(page);

  expect(seen.length).toBeGreaterThan(0);
  expect(seen).toContain("/");

  for (const path of seen) {
    expect(path, `${path} exposed a version prefix to a public visitor`).not.toMatch(
      VERSION_SHAPED,
    );
  }

  // The walk is only worth its runtime if the app actually rendered. Without this, an app that
  // failed to boot would satisfy every assertion above by visiting nothing but "/".
  await expect(page.getByRole("heading", { name: "Widgets" })).toBeVisible();
});

/* Test 2 — the prefixed mount of the version that is currently public. */
test("a prefixed path sends a visitor to the canonical one", async ({ page }) => {
  // `/v1.0.0` is a real mount: every registered version is mounted under its own prefix for
  // administrators, including the one being served publicly, so an administrator can compare
  // them without changing what anyone else gets. This browser is not one.
  await page.goto("/v1.0.0");

  await expectPath(page, "/");
  await expect(page.getByRole("heading", { name: "Widgets" })).toBeVisible();
});

test("a prefixed path keeps its query when it sends a visitor back", async ({ page }) => {
  // The redirect carries `search` deliberately: an outstanding link with parameters in it
  // should land somewhere that still works, not at a bare root that has dropped them. This is
  // the rule a share link would depend on, which is why §1 can drop the share-link test
  // without dropping the behaviour.
  await page.goto("/v1.0.0?from=an-old-link");

  await expectPath(page, "/?from=an-old-link");
});

/* Test 3 in the current §1 — a design version's prefix, which no visitor should hold. */
test("a /design/ path sends a visitor to the canonical root", async ({ page }) => {
  await page.goto("/design/v4.0.0/briefing");

  await expectPath(page, "/");
  await expect(page.getByRole("heading", { name: "Widgets" })).toBeVisible();
});

test("a retired version prefix sends a visitor to the canonical root", async ({ page }) => {
  // Same rule, different door. `/v9.9.9/…` is version-shaped and claimed by nothing, which is
  // what a bookmark of a decommissioned version looks like a year later.
  await page.goto("/v9.9.9/something-that-was-a-screen");

  await expectPath(page, "/");
});

/*
 * An honesty note about the two tests above, worth more than a green tick.
 *
 * No design version is registered in this template — `DESIGN_VERSIONS` is empty — so
 * `/design/v4.0.0/briefing` matches no route at all and is handled by `UnmatchedRoute`, the
 * catch-all, rather than by `RequireAdministrator`, the gate. Both land in the same place, so
 * these tests pass either way, and that means they do NOT on their own prove the administrator
 * gate works: an administrator gets the identical redirect here, and
 * `../design-preview/administrator-mounts.spec.ts` asserts exactly that.
 *
 * What proves the gate is the pair: `/v1.0.0` above, which a visitor is redirected away from,
 * against the same URL in the design-preview project, where it renders. Read them together or
 * neither says much.
 */
