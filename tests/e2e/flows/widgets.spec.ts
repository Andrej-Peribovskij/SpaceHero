import { expect, test } from "@playwright/test";

/**
 * The seeded widget, rendered in a real browser by the real app, fetched from the
 * real API, read out of a real PostgreSQL. Every layer in one assertion — which
 * is what makes this worth the servers it starts.
 */
test("shows the seeded widget", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Widgets" })).toBeVisible();
  await expect(page.getByText("Sample widget")).toBeVisible();
});

test("refuses an unauthenticated write", async ({ request }) => {
  const response = await request.post("http://localhost:3100/api/v1/widgets", {
    data: { name: "Should not be created" },
  });

  expect(response.status()).toBe(401);
});

test("serves the API's own contract document", async ({ request }) => {
  const response = await request.get("http://localhost:3100/openapi/v1.json");

  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toHaveProperty("paths./api/v1/widgets");
});
