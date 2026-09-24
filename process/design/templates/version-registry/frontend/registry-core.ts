/*
 * Reference copy from process/design/templates/version-registry/.
 * Process-owned: keep it in step with the reference rather than editing it in place.
 * Project content belongs in ./registry.tsx, which this file knows nothing about.
 */

import type { ComponentType } from "react";

/**
 * The version registry's vocabulary and its pure rules, with no project's versions in it.
 *
 * Split out from `registry.tsx` on purpose: the *table* is a project's own, the *rules* about
 * how a table is read are the process's, and only one of those two should differ between the
 * repositories that adopt this process. Every function here takes the table as an argument;
 * `registry.tsx` binds them to its own and re-exports them, so application code keeps calling
 * `findVersion(id)` rather than `findVersionIn(VERSIONS, id)`.
 */

/**
 * What a version is for.
 *
 * `prod` versions talk to real backends and one of them is served unprefixed at the root (see
 * `public-version.tsx`). `design` versions are mocked, administrator-only, never public, and
 * are dropped from a build that does not opt in.
 */
export type VersionKind = "prod" | "design";

/**
 * One route of one version.
 *
 * `Guard` is the project's own union of guard names — the registry never knows what a guard
 * *does*, only which one a route asked for. `mount.tsx` hands the name back to the app, which
 * is the only place that can turn it into a component.
 */
export interface RouteSpec<Guard extends string = string> {
  /** RELATIVE to the version's own base — "start", "project/:id", "" for the entry route. */
  path: string;
  /**
   * The component, not an element. A design version's is a `lazy()` wrapper so its code is
   * emitted as its own chunk and never enters the public entry bundle; a prod version's is
   * imported directly, because one of them is the app real users get.
   */
  component: ComponentType;
  guard: Guard;
}

export interface VersionEntry<Guard extends string = string> {
  id: string;
  kind: VersionKind;
  /**
   * true = talks to real backends. Check this, never the folder path: a wired version can
   * still live under `pages/design/`, and a version copied out of one is not wired by having
   * moved.
   */
  wired: boolean;
  /** Human label, for a version switcher. */
  label: string;
  /** A route path from `routes` — where a visitor lands at the version's base URL. */
  entryRoute: string;
  routes: RouteSpec<Guard>[];
}

/**
 * The shape of a production version's mount prefix: `v1.0.0`, `v2`, `v2.1.0-tech`.
 *
 * One definition, read by both the prefix matcher and the reserved-root check, so a path that
 * routes as a version can never also be claimed as a route segment by one.
 */
export const VERSION_PREFIX = /^v\d+(?:\.\d+)*(?:-[A-Za-z0-9.]+)?$/;

/** Where a version is mounted on its prefixed, administrator-only alias. */
export function versionBasePath(version: VersionEntry): string {
  return version.kind === "design" ? `/design/${version.id}` : `/${version.id}`;
}

/** `/design/v2.0.0/project/:id` — the full router path for one route spec. */
export function versionRoutePath(version: VersionEntry, route: RouteSpec): string {
  const base = versionBasePath(version);
  return route.path ? `${base}/${route.path}` : base;
}

/**
 * A registered version by id.
 *
 * `kind` disambiguates a deliberate id collision: a production `v2.0.0` promoted out of the
 * design version `v2.0.0` keeps the same name, and both stay registered — the design entry is
 * the record of what was approved. Callers pass the kind they matched, so a `/design/` path
 * never resolves to the production version of the same name or the reverse. Absent, production
 * wins, because an unqualified id in application code means the real thing.
 */
export function findVersionIn<Guard extends string>(
  versions: VersionEntry<Guard>[],
  id: string | null | undefined,
  kind?: VersionKind,
): VersionEntry<Guard> | undefined {
  if (!id) return undefined;
  if (kind) return versions.find((v) => v.id === id && v.kind === kind);
  return versions.find((v) => v.id === id);
}

/**
 * Match a pathname against the prefixed mounts.
 *
 * Returns the version and the remainder of the path relative to its base, so a redirect off a
 * version can keep the subpath and its params — the difference between an outstanding
 * `/v1.0.0/project/abc` link landing a non-administrator on that project and dumping them at
 * the root.
 *
 * Deliberately also matches version-shaped prefixes that no version claims (`/v9/start`), so a
 * retired URL goes through the same gate rather than needing a hand-written redirect per path.
 * `version` is then undefined while `id` and `rest` are still populated.
 */
export function matchVersionPrefixIn<Guard extends string>(
  versions: VersionEntry<Guard>[],
  pathname: string,
): { version?: VersionEntry<Guard>; id: string; rest: string } | null {
  const design = /^\/design\/([^/]+)(\/.*)?$/.exec(pathname);
  if (design) {
    return {
      version: findVersionIn(versions, design[1], "design"),
      id: design[1]!,
      rest: design[2] ?? "",
    };
  }

  const prod = /^\/(v\d+(?:\.\d+)*(?:-[A-Za-z0-9.]+)?)(\/.*)?$/.exec(pathname);
  if (prod) {
    return {
      version: findVersionIn(versions, prod[1], "prod"),
      id: prod[1]!,
      rest: prod[2] ?? "",
    };
  }

  return null;
}

/**
 * Whether a concrete subpath fits a route's pattern — `project/abc` against `project/:id`.
 *
 * Segment count and literals have to agree; a `:param` segment matches anything non-empty.
 * Deliberately not a router lookup: this runs while deciding where to send someone, before
 * there is a match to read.
 */
export function matchesRouteShape(pattern: string, pathname: string): boolean {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);

  if (patternSegments.length !== pathSegments.length) return false;

  return patternSegments.every(
    (segment, index) => segment.startsWith(":") || segment === pathSegments[index],
  );
}

/**
 * Throws if a version's id or a route's first segment collides with the app shell's own roots.
 *
 * This matters most for production versions, because a production version mounts canonically
 * as well as at its prefix and therefore shares the root namespace with the shell — a version
 * that introduced a page called `login` would shadow the real login page, and would do so only
 * once that version became public, long after it was written. Design versions are checked too:
 * they are candidates for promotion, and finding the collision now is cheaper than finding it
 * on the day someone copies them.
 *
 * Always throws, with no environment check of its own — the caller decides when to run it.
 * `registry.tsx` binds it to this project's reserved roots; the app calls the bound form once
 * at startup in development, and the contract test calls it on every commit.
 */
export function assertNoReservedRootCollisionsIn(
  versions: VersionEntry<string>[],
  reservedRoots: readonly string[],
): void {
  for (const version of versions) {
    // A production version's id is itself a root path. `v1.0.0` is fine; a version called
    // `admin` would silently take the shell's.
    if (version.kind === "prod" && reservedRoots.includes(version.id)) {
      throw new Error(`prod version "${version.id}" collides with the reserved root "${version.id}"`);
    }

    for (const route of version.routes) {
      const firstSegment = route.path.split("/")[0];
      if (!firstSegment) continue;

      if (reservedRoots.includes(firstSegment)) {
        throw new Error(
          `${version.kind} version "${version.id}" route "${route.path}" collides with the `
            + `reserved root "${firstSegment}"`,
        );
      }

      // A route segment shaped like a version prefix would be unreachable on the canonical
      // mount: the prefix matcher claims it first and redirects rather than rendering.
      if (VERSION_PREFIX.test(firstSegment)) {
        throw new Error(
          `${version.kind} version "${version.id}" route "${route.path}" starts with a `
            + `version-shaped segment "${firstSegment}", which the version prefix matcher `
            + "claims before the canonical mount can serve it",
        );
      }
    }
  }
}
