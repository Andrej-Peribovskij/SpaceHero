import { expect, test } from "@playwright/test";

/**
 * The Chapter 1 intro in a real browser: the gate, the first card, the skip.
 *
 * The component tests play the whole sequence on fake timers. This one is the part they
 * cannot prove — that the real frame clock moves the video on, and that a real key press and
 * a real click drive it — so it walks the shortest honest path through it and stops.
 */
test("a player opts in, watches the first card, and skips to the end", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("PRESS ANY KEY TO BEGIN ORIENTATION")).toBeVisible();

  await page.keyboard.press("Space");

  await expect(page.getByText("PRESS ANY KEY TO BEGIN ORIENTATION")).toBeHidden();
  // The ident holds for a moment before card 1: the Brightening.
  await expect(page.getByRole("img", { name: /^The Sun, filling more of the frame/ })).toBeVisible();

  await page.getByRole("button", { name: "Skipping is recorded." }).click();

  // The end is Module 2's ident, asking for a key the way the first one did.
  await expect(page.getByText("PRESS ANY KEY TO CONTINUE ORIENTATION")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skipping is recorded." })).toBeHidden();
});
