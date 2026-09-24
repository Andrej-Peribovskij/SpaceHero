import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Routes, useLocation } from "react-router-dom";

import { resetRuntimeConfig } from "../infra/config/runtime-config";
import { DESIGN_VERSIONS_PREVIEW } from "../infra/auth/use-is-administrator";
import { useIsAdministrator } from "../infra/auth/use-is-administrator";
import { server, installMockApi } from "../testing/msw";
import { resolveCanonicalPath, useVersionRoutes } from "./mount";
import { PublicVersionProvider } from "./public-version";
import type { RouteGuard } from "./registry";

const API_URL = "http://api.test";

installMockApi();

beforeEach(() => {
  resetRuntimeConfig();
  server.use(
    http.get("/config.json", () => HttpResponse.json({ apiUrl: API_URL })),
    http.get("/api/v1/public-config", () => HttpResponse.json({ publicUiVersion: "v1.0.0" })),
    // One widget, not none: WidgetsView renders its <h1> only when it has data, so an
    // empty list would make every assertion below pass against the empty state instead
    // of against the screen the route actually mounted.
    http.get(`${API_URL}/api/v1/widgets`, () =>
      HttpResponse.json([
        { id: "0199a0e6-0000-7000-8000-000000000001", name: "Sprocket", createdAt: "2026-01-01T00:00:00Z" },
      ]),
    ),
  );
});

/** Answer /api/v1/me as an anonymous caller, an administrator, or a plain signed-in user. */
function mockMe(capabilities: string[] | "anonymous"): void {
  server.use(
    http.get(`${API_URL}/api/v1/me`, () =>
      HttpResponse.json(
        capabilities === "anonymous"
          ? { authenticated: false, subjectId: "", capabilities: [] }
          : { authenticated: true, subjectId: "user-1", capabilities },
      ),
    ),
  );
}

/**
 * The current pathname, rendered.
 *
 * Asserting on the screen cannot distinguish "served at the prefixed mount" from
 * "redirected to the canonical one": when the prefixed version IS the public one, both
 * render the same component. Only the location tells them apart — and the gate's whole job
 * is deciding the location.
 */
function LocationProbe(): ReactElement {
  return <output data-testid="pathname">{useLocation().pathname}</output>;
}

function renderAt(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderGuard = (_guard: RouteGuard, page: ReactElement): ReactElement => page;

  function AppRoutes() {
    const isAdministrator = useIsAdministrator();
    return (
      <>
        <LocationProbe />
        <Routes>{useVersionRoutes({ renderGuard, isAdministrator })}</Routes>
      </>
    );
  }

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  render(
    <Wrapper>
      <PublicVersionProvider fallback={<p>booting</p>}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </PublicVersionProvider>
    </Wrapper>,
  );
}

/**
 * The redirect rule, checked directly.
 *
 * `resolveCanonicalPath` is exported precisely so these can assert the rule rather than
 * infer it from what rendered — a redirect test that goes through the router proves the
 * destination, not the reason.
 */
describe("resolveCanonicalPath", () => {
  const publicRoutes = ["", "briefing", "reports/:id"];

  it("drops the prefix when the version IS the public one", () => {
    expect(resolveCanonicalPath("v1.0.0", "/briefing", "v1.0.0", "", publicRoutes)).toBe("/briefing");
  });

  it("falls back to the entry route for a bare prefix of the public version", () => {
    expect(resolveCanonicalPath("v1.0.0", "", "v1.0.0", "", publicRoutes)).toBe("/");
  });

  it("keeps the subpath when another version's shape exists publicly", () => {
    expect(resolveCanonicalPath("v0.9.0", "/briefing", "v1.0.0", "", publicRoutes)).toBe("/briefing");
  });

  it("keeps a parameterised subpath, matched by shape rather than by string", () => {
    expect(resolveCanonicalPath("v0.9.0", "/reports/42", "v1.0.0", "", publicRoutes)).toBe("/reports/42");
  });

  it("lands on the entry route when the public version does not serve that shape", () => {
    expect(resolveCanonicalPath("v0.9.0", "/retired-screen", "v1.0.0", "", publicRoutes)).toBe("/");
  });
});

describe("the administrator gate on prefixed mounts", () => {
  const pathname = () => screen.getByTestId("pathname").textContent;

  it("serves the canonical mount to an anonymous visitor", async () => {
    mockMe("anonymous");
    renderAt("/");

    expect(await screen.findByRole("heading", { name: /widgets/i })).toBeInTheDocument();
    expect(pathname()).toBe("/");
  });

  it("leaves an administrator on the prefixed mount", async () => {
    mockMe([DESIGN_VERSIONS_PREVIEW]);
    renderAt("/v1.0.0");

    expect(await screen.findByRole("heading", { name: /widgets/i })).toBeInTheDocument();
    expect(pathname()).toBe("/v1.0.0");
  });

  it("carries a non-administrator from the prefixed mount to the canonical one", async () => {
    mockMe([]);
    renderAt("/v1.0.0");

    await waitFor(() => expect(pathname()).toBe("/"));
    expect(await screen.findByRole("heading", { name: /widgets/i })).toBeInTheDocument();
  });

  /**
   * The race the third state exists to prevent.
   *
   * While GET /api/v1/me is in flight `useIsAdministrator()` is `undefined`, and the gate
   * must render NOTHING rather than redirect. If `undefined` were collapsed into `false`,
   * an administrator opening a prefixed URL would be bounced to the canonical mount before
   * their own capabilities arrived — intermittently, and worst on the slowest deployments.
   *
   * Asserted on the LOCATION, deliberately. An earlier version of this test asserted that
   * the page eventually rendered, and passed with the bug deliberately planted: the redirect
   * target renders the same component, so the screen cannot tell the two apart.
   */
  it("redirects nobody while the answer is still loading", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.use(
      http.get(`${API_URL}/api/v1/me`, async () => {
        await held;
        return HttpResponse.json({
          authenticated: true,
          subjectId: "user-1",
          capabilities: [DESIGN_VERSIONS_PREVIEW],
        });
      }),
    );

    renderAt("/v1.0.0");

    // Past the boot skeleton: public-config has resolved, so the gate is rendering.
    await waitFor(() => expect(screen.queryByText("booting")).not.toBeInTheDocument());

    // Still on the prefixed mount, and showing nothing rather than having redirected.
    expect(pathname()).toBe("/v1.0.0");
    expect(screen.queryByRole("heading", { name: /widgets/i })).not.toBeInTheDocument();

    release();

    // ...and once the answer lands, the administrator gets the page they asked for, at the
    // URL they asked for it at.
    expect(await screen.findByRole("heading", { name: /widgets/i })).toBeInTheDocument();
    expect(pathname()).toBe("/v1.0.0");
  });
});
