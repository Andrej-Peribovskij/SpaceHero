import { setupServer } from "msw/node";

/**
 * The one network boundary the frontend tests stub.
 *
 * Handlers are declared per test rather than centrally: a shared default set is
 * how a test ends up passing against an endpoint the app no longer calls. Each
 * test registers the exact paths it expects, so a wrong path is a failure rather
 * than a fallthrough.
 */
export const server = setupServer();

/**
 * Call once per test file, before any component renders.
 *
 * Not a React hook, despite registering things — it installs Vitest lifecycle
 * hooks. It was called `useMockApi` until ESLint's rules-of-hooks read the
 * prefix the way a reader would and reported a hook called at the top level.
 */
export function installMockApi(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
