import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter, Routes } from "react-router-dom";
import type { ReactElement } from "react";

import { useIsAdministrator } from "./infra/auth/use-is-administrator";
import { PublicVersionProvider } from "./versions/public-version";
import type { RouteGuard } from "./versions/registry";
import { useVersionRoutes } from "./versions/mount";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
    },
  },
});

/**
 * Turns a guard NAME from the registry into the component that enforces it.
 *
 * The registry knows which guard a route asked for; only the app knows what that guard is,
 * which is why this mapping lives here and not in `versions/`. This template ships no session
 * yet, so "session" and "role:admin" render their page unguarded — deliberately visible as a
 * gap rather than hidden behind a guard that silently allows everything. Wire them to real
 * guards when this scaffold grows a session, and change nothing else.
 */
function renderGuard(_guard: RouteGuard, page: ReactElement): ReactElement {
  return page;
}

/**
 * The router never names a version and never names a screen.
 *
 * Every route comes from `versions/registry.tsx` through `useVersionRoutes`. Adding a version
 * is appending an entry there; if it ever meant editing this file, the registry would not be
 * doing its job.
 */
function AppRoutes() {
  const isAdministrator = useIsAdministrator();

  return <Routes>{useVersionRoutes({ renderGuard, isAdministrator })}</Routes>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/*
        Blocks first paint on GET /api/v1/public-config. Which version is public decides which
        route table "/" is matched against, so guessing would flash one version's screen before
        replacing it with another's.
      */}
      <PublicVersionProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </PublicVersionProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
