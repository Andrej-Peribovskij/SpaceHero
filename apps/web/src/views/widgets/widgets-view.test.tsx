import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";

import { resetRuntimeConfig } from "../../infra/config/runtime-config";
import { server, installMockApi } from "../../testing/msw";
import { WidgetsView } from "./widgets-view";

const API_URL = "http://api.test";

installMockApi();

beforeEach(() => {
  resetRuntimeConfig();
  server.use(http.get("/config.json", () => HttpResponse.json({ apiUrl: API_URL })));
});

function renderView(): void {
  // Retries off, so the error state is asserted once rather than after a delay.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  render(<WidgetsView />, { wrapper: Wrapper });
}

test("renders the widgets the API returns", async () => {
  server.use(
    http.get(`${API_URL}/api/v1/widgets`, () =>
      HttpResponse.json([
        { id: "0199bd0e-0000-7000-8000-000000000001", name: "Sample widget", createdAt: "2026-01-01T12:00:00Z" },
      ]),
    ),
  );

  renderView();

  expect(await screen.findByText("Sample widget")).toBeInTheDocument();
});

test("renders the empty state rather than an empty list", async () => {
  server.use(http.get(`${API_URL}/api/v1/widgets`, () => HttpResponse.json([])));

  renderView();

  expect(await screen.findByText("No widgets yet.")).toBeInTheDocument();
});

test("reports a failure instead of falling through to the empty state", async () => {
  server.use(
    http.get(`${API_URL}/api/v1/widgets`, () =>
      HttpResponse.json(
        { title: "Service unavailable", detail: "The database is not reachable.", code: "db.unavailable" },
        { status: 503 },
      ),
    ),
  );

  renderView();

  expect(await screen.findByRole("alert")).toHaveTextContent("The database is not reachable.");
});

test("offers a design-system retry control that refetches", async () => {
  let attempts = 0;

  server.use(
    http.get(`${API_URL}/api/v1/widgets`, () => {
      attempts += 1;

      if (attempts === 1) {
        return HttpResponse.json(
          { title: "Service unavailable", detail: "The database is not reachable.", code: "db.unavailable" },
          { status: 503 },
        );
      }

      return HttpResponse.json([
        { id: "0199bd0e-0000-7000-8000-000000000002", name: "Recovered widget", createdAt: "2026-01-01T12:00:00Z" },
      ]);
    }),
  );

  renderView();

  await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

  expect(await screen.findByText("Recovered widget")).toBeInTheDocument();
});
