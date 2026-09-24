/*
 * Reference copy from process/design/templates/version-registry/. Yours once copied.
 * THIS FILE IS YOURS. It is written once and never regenerated: it holds this project's
 * versions, guards and reserved roots. Everything beside it in `versions/` is package-owned
 * and is process-owned — see ./README.md for which is which.
 */

import { lazy, type ComponentType } from "react";
import {
  assertNoReservedRootCollisionsIn,
  findVersionIn,
  matchVersionPrefixIn,
  type RouteSpec as CoreRouteSpec,
  type VersionEntry as CoreVersionEntry,
  type VersionKind,
} from "./registry-core";

/**
 * The single source of truth for UI versions.
 *
 * Routing, the guards, the canonical mount and the off-version redirect all read from this
 * table. Adding a version means appending an entry — if it ever requires editing the router,
 * this file is not doing its job.
 *
 * See `docs/design-version-registry.md` for the contract this
 * file is held to, and `versions/registry.contract.test.ts` for the test that enforces it.
 */

/**
 * Which of the app's guards wraps a route.
 *
 * EDIT THIS to name your app's own guards. The registry never knows what a guard *does* — the
 * app maps each name to a component in its `renderGuard`, which is the only place that can.
 * "none" means public and unauthenticated, and is the one name the process assumes exists.
 */
export type RouteGuard = "session" | "role:admin" | "none";

export type { VersionKind };
export type RouteSpec = CoreRouteSpec<RouteGuard>;
export type VersionEntry = CoreVersionEntry<RouteGuard>;

/**
 * Root path segments the app shell owns, which no version may claim.
 *
 * EDIT THIS to match your shell's own routes. A version that introduced a page called `login`
 * would shadow the real login page — and would do so only once that version became public,
 * long after it was written. `assertNoReservedRootCollisions` below is what catches it on the
 * day it is written instead.
 */
export const RESERVED_ROOT_PREFIXES: readonly string[] = ["__RESERVED_ROOTS__"];

/**
 * Design routes are excluded from the production bundle unless explicitly opted in — dev
 * always includes them so a local run can reach `/design/*`.
 *
 * A build-time flag, deliberately, unlike `PUBLIC_UI_VERSION`: dropping code is a property of
 * the artefact and cannot be decided at runtime. Lazy loading is not the exclusion — the
 * chunks are fetchable by anyone who guesses the URL. This flag is.
 *
 * Vite is assumed here. On another bundler, replace the right-hand side with that bundler's
 * equivalent (`process.env.NODE_ENV !== "production" || process.env.INCLUDE_DESIGN_VERSIONS`
 * under webpack) — the rest of `versions/` never reads the bundler's globals.
 */
export const INCLUDE_DESIGN_VERSIONS: boolean =
  import.meta.env.DEV || import.meta.env.VITE_INCLUDE_DESIGN_VERSIONS === "true";

/**
 * The placeholder this scaffold seeds, so the app boots and routes before a real version is
 * registered. Delete it as soon as the first entry below points at real screens.
 */
function UnregisteredVersionNotice() {
  return (
    <main style={{ font: "400 14px/1.6 system-ui, sans-serif", padding: "3rem", maxWidth: "40rem" }}>
      <h1 style={{ font: "600 18px/1.4 system-ui, sans-serif" }}>No UI version is registered yet</h1>
      <p>
        This is the placeholder route seeded into <code>src/versions/registry.tsx</code>. Replace
        the entry in <code>PROD_VERSIONS</code> with this app&rsquo;s real screens — see{" "}
        <code>src/versions/README.md</code>.
      </p>
    </main>
  );
}

/**
 * Production versions, always in the build.
 *
 * Declared outside `INCLUDE_DESIGN_VERSIONS` and with their components imported directly
 * rather than lazily: one of these is the app real users get, so it is never dropped by a
 * build flag and never arrives as a second round-trip after first paint.
 *
 * Order is meaningful and is the only ordering — never semver-sorted. Under semver precedence
 * a `-tech` prerelease sorts *before* the version it revises, the exact inverse of the truth.
 * `PROD_VERSIONS[0]` is also the fail-safe public version, which is why the oldest and
 * most-proven entry comes first.
 */
export const PROD_VERSIONS: VersionEntry[] = [
  {
    id: "__PROD_VERSION_ID__",
    kind: "prod",
    wired: true,
    label: "__PROD_VERSION_ID__ — current",
    entryRoute: "",
    routes: [
      // Replace with this app's screens. Paths are RELATIVE — never "/__PROD_VERSION_ID__/…".
      { path: "", component: UnregisteredVersionNotice, guard: "none" },
    ],
  },
];

/**
 * Design versions, in order of appearance. Array position is the only ordering — never sorted.
 *
 * Appended to by prompt 01, one entry per design version, each route a `lazy()` import so the
 * whole branch — and every chunk under `pages/design/**` — disappears when the flag is off.
 */
export const DESIGN_VERSIONS: VersionEntry[] = INCLUDE_DESIGN_VERSIONS ? [] : [];

/**
 * Every registered version, production first.
 *
 * This is what mounts at the prefixed, administrator-only aliases. The canonical mount reads
 * `PROD_VERSIONS` through `PublicVersionProvider` instead — a design version can never be
 * served there, whatever the deployment names.
 */
export const VERSIONS: VersionEntry[] = [...PROD_VERSIONS, ...DESIGN_VERSIONS];

// ── the core rules, bound to this project's table ────────────────────────────────────────────
// Application code calls these, never the `*In` forms: the table is an implementation detail of
// this file, and a caller that had to pass it could pass the wrong one.

export {
  matchesRouteShape,
  versionBasePath,
  versionRoutePath,
  VERSION_PREFIX,
} from "./registry-core";

/** A registered version by id — production wins when no kind is given. */
export function findVersion(id: string | null | undefined, kind?: VersionKind): VersionEntry | undefined {
  return findVersionIn(VERSIONS, id, kind);
}

/** Match a pathname against the prefixed mounts, keeping the remainder. */
export function matchVersionPrefix(pathname: string) {
  return matchVersionPrefixIn(VERSIONS, pathname);
}

/**
 * Startup guard: no version id or route may shadow a reserved root.
 *
 * Call it from the app once in development, and from the contract test on every commit — see
 * `registry.contract.test.ts`. It throws rather than warns: a collision is unroutable, not
 * untidy.
 */
export function assertNoReservedRootCollisions(versions: VersionEntry[] = VERSIONS): void {
  assertNoReservedRootCollisionsIn(versions, RESERVED_ROOT_PREFIXES);
}

/**
 * Load a named export as a lazy route component — the helper every design entry uses.
 *
 *   component: lazyPage(() => import("../pages/design/v2.0.0/StartPage.js"), "StartPage")
 *
 * Unused until the first design version is registered; kept here so prompt 01 has it to hand
 * and every design entry is written the same way.
 */
export function lazyPage(
  loader: () => Promise<Record<string, ComponentType>>,
  name: string,
): ComponentType {
  return lazy(async () => ({ default: (await loader())[name]! })) as ComponentType;
}
