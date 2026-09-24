/*
 * Reference copy from process/design/templates/version-registry/.
 * Process-owned: keep it in step with the reference rather than editing it in place.
 */

import { Suspense, type ReactElement, type ReactNode } from "react";
import { Navigate, Route, useLocation } from "react-router-dom";
import { usePublicVersion } from "./public-version";
import {
  matchesRouteShape,
  matchVersionPrefix,
  VERSIONS,
  versionBasePath,
  type RouteGuard,
  type RouteSpec,
  type VersionEntry,
} from "./registry";
import { joinVersionPath, VersionBaseContext } from "./version-base";

/**
 * Every route every version serves, ready to drop into the app's `<Routes>`.
 *
 * The app router never names a version and never names a screen. It writes:
 *
 *   <Routes>
 *     {useVersionRoutes({ renderGuard, isAdministrator })}
 *     <Route path="/login" element={<LoginView />} />
 *   </Routes>
 *
 * Adding a version means appending to `registry.tsx`. If it ever means editing the router, the
 * registry is not doing its job — which is the whole claim this file exists to make true.
 */

export interface VersionRouteOptions {
  /**
   * Turns a guard *name* from the registry into the component that enforces it. The registry
   * knows which guard a route asked for; only the app knows what that guard is.
   *
   *   (guard, page) => guard === "session" ? <RequireSession>{page}</RequireSession> : page
   */
  renderGuard: (guard: RouteGuard, page: ReactElement) => ReactElement;
  /**
   * Whether the current user may see the prefixed, administrator-only mounts.
   *
   * `undefined` means "not known yet" — a session still loading — and renders nothing rather
   * than redirecting, so an administrator is never bounced off their own URL by a race.
   */
  isAdministrator: boolean | undefined;
  /** Shown while a lazy design chunk loads. */
  suspenseFallback?: ReactNode;
  /**
   * Mount the `*` catch-all that carries an unclaimed version-shaped path onto the public
   * version. Leave it on unless the app serves its own 404 — see `UnmatchedRoute` below for
   * what is lost by turning it off.
   */
  catchAll?: boolean;
}

export function useVersionRoutes(options: VersionRouteOptions): ReactElement[] {
  const publicVersion = usePublicVersion();
  const { catchAll = true } = options;

  return [
    /*
      The canonical mount: the public version, unprefixed. The real app.

      Its "" route is served by `RootLanding` at "/" instead, so the root can also be where a
      returning user is dispatched from.
    */
    ...publicVersion.routes
      .filter((route) => route.path !== "")
      .map((route) => mountRoute(publicVersion, route, "", false, options)),

    <Route key="/" path="/" element={<RootLanding options={options} />} />,

    /*
      Prefixed mounts: every registered version, administrators only — including the one that is
      currently public, so an administrator can compare versions without changing what anybody
      else gets. Design versions are mocked and never reachable any other way.
    */
    ...VERSIONS.flatMap((version) =>
      version.routes.map((route) =>
        mountRoute(version, route, versionBasePath(version), true, options),
      ),
    ),

    ...(catchAll ? [<Route key="*" path="*" element={<UnmatchedRoute />} />] : []),
  ];
}

/**
 * One route element, for one version at one mount.
 *
 * `basePath` is what every screen beneath reads through `useVersionPath` / `useVersionNav`: ""
 * on the canonical mount, "/v1.0.0" or "/design/v2.0.0" on a prefixed one. The components are
 * identical at both, which is the point — a version is not a copy of the app per mount.
 */
function mountRoute(
  version: VersionEntry,
  spec: RouteSpec,
  basePath: string,
  prefixed: boolean,
  options: VersionRouteOptions,
): ReactElement {
  const path = joinVersionPath(basePath, spec.path);
  const page = guarded(spec, options);

  return (
    <Route
      key={`${version.kind}:${version.id}:${path}`}
      path={path}
      element={
        <VersionBaseContext.Provider value={basePath}>
          {/*
            Design routes are lazy, so every mount needs a boundary. Cheap enough to apply
            uniformly — a directly-imported production component never suspends.
          */}
          <Suspense fallback={options.suspenseFallback ?? null}>
            {prefixed ? <RequireAdministrator options={options}>{page}</RequireAdministrator> : page}
          </Suspense>
        </VersionBaseContext.Provider>
      }
    />
  );
}

/** The route's own guard, from the registry. Prefixed mounts add the administrator gate on top. */
function guarded(spec: RouteSpec, options: VersionRouteOptions): ReactElement {
  return options.renderGuard(spec.guard, <spec.component />);
}

/**
 * Guards the prefixed, administrator-only mounts.
 *
 *   administrator, anything                → allow
 *   not yet known                          → render nothing; the session is still loading
 *   other, /vX/… where vX is public        → the canonical equivalent, preserving subpath,
 *                                            params and query
 *   other, any other version prefix        → best-effort onto the public version, falling back
 *                                            to its entry route
 *
 * The third rule matters more than it looks. Share links of the form `/v3/p/:token` circulate
 * and are opened by people who are not administrators; a blanket "non-admin on a versioned path
 * → root" rule would break every outstanding one.
 */
function RequireAdministrator({
  children,
  options,
}: {
  children: ReactElement;
  options: VersionRouteOptions;
}): ReactElement | null {
  const publicVersion = usePublicVersion();
  const { pathname, search, hash } = useLocation();

  if (options.isAdministrator === undefined) return null;
  if (options.isAdministrator) return children;

  const matched = matchVersionPrefix(pathname);
  // Not on a prefixed mount at all — nothing for this gate to do.
  if (!matched) return children;

  const target = resolveCanonicalPath(
    matched.id,
    matched.rest,
    publicVersion.id,
    publicVersion.entryRoute,
    publicVersion.routes.map((route) => route.path),
  );

  return <Navigate to={`${target}${search}${hash}`} replace />;
}

/**
 * Map a path on a version's prefixed mount onto the canonical, unprefixed one.
 *
 * Same version → the subpath is already correct, just drop the prefix. A different version →
 * keep the subpath only if the public version actually serves that shape, otherwise land on its
 * entry route. Makes a stale bookmark mostly work instead of always dumping the visitor at the
 * root, and replaces every hand-written per-path retirement redirect with one rule.
 *
 * Exported because the routing tests are easier to trust when they check the rule directly.
 */
export function resolveCanonicalPath(
  fromVersionId: string,
  rest: string,
  publicVersionId: string,
  publicEntryRoute: string,
  publicRoutePaths: string[],
): string {
  if (fromVersionId === publicVersionId) return rest || "/";

  const relative = rest.replace(/^\//, "");

  if (relative && publicRoutePaths.some((pattern) => matchesRouteShape(pattern, relative))) {
    return rest;
  }

  return joinVersionPath("", publicEntryRoute);
}

/**
 * The root.
 *
 * The public version's own root screen *is* "/", so it renders in place rather than redirecting
 * to a second URL for the same thing. A version with no "" route sends the visitor to its entry
 * route instead.
 */
function RootLanding({ options }: { options: VersionRouteOptions }): ReactElement {
  const publicVersion = usePublicVersion();
  const root = publicVersion.routes.find((route) => route.path === "");

  if (!root) {
    return <Navigate to={joinVersionPath("", publicVersion.entryRoute)} replace />;
  }

  return (
    <VersionBaseContext.Provider value="">
      <Suspense fallback={options.suspenseFallback ?? null}>{guarded(root, options)}</Suspense>
    </VersionBaseContext.Provider>
  );
}

/**
 * Anything no route claimed.
 *
 * A version-shaped prefix that no version serves — a retired `/v0.9.0/briefing`, or a path a
 * newer version dropped — is carried onto the public version with its subpath and params
 * intact, because that subpath is usually still a screen. One gate, rather than a hand-written
 * redirect per retired path.
 */
function UnmatchedRoute(): ReactElement {
  const { pathname, search } = useLocation();
  const publicVersion = usePublicVersion();
  const match = matchVersionPrefix(pathname);

  if (!match) return <Navigate to="/" replace />;

  const target = resolveCanonicalPath(
    match.id,
    match.rest,
    publicVersion.id,
    publicVersion.entryRoute,
    publicVersion.routes.map((route) => route.path),
  );

  return <Navigate to={`${target}${search}`} replace />;
}
