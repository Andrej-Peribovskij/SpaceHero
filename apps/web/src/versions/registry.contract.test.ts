/*
 * Reference copy from process/design/templates/version-registry/.
 * Process-owned: keep it in step with the reference rather than editing it in place.
 *
 * Write this project's own registry tests in a separate file (registry.test.ts) — what a
 * version serves, which guard a screen sits behind. This one only checks the contract every
 * version in this repository shares, so that tightening it is one edit.
 */

import { describe, expect, it, vi } from "vitest";
import { resolvePublicVersion } from "./public-version";
import {
  assertNoReservedRootCollisions,
  DESIGN_VERSIONS,
  findVersion,
  matchVersionPrefix,
  PROD_VERSIONS,
  VERSION_PREFIX,
  versionBasePath,
  VERSIONS,
} from "./registry";

/**
 * The version registry contract, from `docs/design-version-registry.md`.
 *
 * Every rule here is one that breaks the public app quietly if it is violated — a design
 * version served to real users, a route unreachable on the canonical mount, a fallback that
 * falls back to something that does not work. None of them is caught by the type system, and
 * several only show up on the day a version is promoted.
 */
describe("the version registry contract", () => {
  it("orders production versions before design versions", () => {
    expect(VERSIONS).toEqual([...PROD_VERSIONS, ...DESIGN_VERSIONS]);
  });

  /*
    The fail-safe. `PROD_VERSIONS[0]` is what the app serves when the deployment names no
    version, names an unknown one, or names a design version — so the first entry has to be one
    that genuinely works, not merely one that exists.
  */
  it("has at least one production version, and it is wired", () => {
    expect(PROD_VERSIONS.length).toBeGreaterThan(0);
    expect(PROD_VERSIONS[0]!.wired).toBe(true);
  });

  it("registers no version twice under the same kind", () => {
    const keys = VERSIONS.map((v) => `${v.kind}:${v.id}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  /*
    A production version's id is its root-level mount prefix, so it has to be one the prefix
    matcher recognises — otherwise `/my-version/start` is not a version path at all, it is a
    404 the catch-all sends to the root. Design versions mount under `/design/` and may be
    called anything.
  */
  it("gives every production version a version-shaped id", () => {
    for (const version of PROD_VERSIONS) {
      expect(version.id, `prod version id "${version.id}"`).toMatch(VERSION_PREFIX);
    }
  });

  it("declares every route path relative to its own version", () => {
    for (const version of VERSIONS) {
      for (const route of version.routes) {
        expect(route.path.startsWith("/"), `${version.id} route "${route.path}"`).toBe(false);
        expect(route.path.startsWith("design/"), `${version.id} route "${route.path}"`).toBe(false);
      }
    }
  });

  it("gives every version at least one route, with no duplicates", () => {
    for (const version of VERSIONS) {
      const paths = version.routes.map((route) => route.path);

      expect(paths.length, `${version.kind} version "${version.id}" has no routes`).toBeGreaterThan(0);
      expect(new Set(paths).size, `${version.kind} version "${version.id}" repeats a route`).toBe(
        paths.length,
      );
    }
  });

  /*
    `entryRoute` is where a visitor is sent when the version has no "" route, and where every
    off-version redirect lands. Naming a route the version does not serve turns both into a trip
    through the catch-all.
  */
  it("points every entryRoute at a route that version serves", () => {
    for (const version of VERSIONS) {
      expect(
        version.routes.map((route) => route.path),
        `${version.kind} version "${version.id}" entryRoute`,
      ).toContain(version.entryRoute);
    }
  });

  it("lets no version id or route shadow a reserved root", () => {
    expect(() => assertNoReservedRootCollisions(VERSIONS)).not.toThrow();
  });

  it("resolves every version's own base path back to itself", () => {
    for (const version of VERSIONS) {
      const matched = matchVersionPrefix(versionBasePath(version));

      expect(matched, `${version.kind} version "${version.id}" base path`).not.toBeNull();
      expect(matched!.version).toBe(version);
      expect(matched!.rest).toBe("");
    }
  });

  it("keeps the app shell's own paths out of the version matcher", () => {
    for (const path of ["/", "/login"]) {
      expect(matchVersionPrefix(path), path).toBeNull();
    }
  });
});

/**
 * What the deployment can name, and what happens when it names something else.
 *
 * The failure modes are the point. A misconfigured `PUBLIC_UI_VERSION` must never stop the app
 * rendering, and must never resolve to a design version — those are mocked, and serving one at
 * the root shows real users invented figures that look exactly like real ones.
 */
describe("resolving the public version", () => {
  it("resolves every production version by its own id", () => {
    for (const version of PROD_VERSIONS) {
      expect(resolvePublicVersion(version.id)).toBe(version);
    }
  });

  it("falls back to the first production version when nothing is named", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(resolvePublicVersion(undefined)).toBe(PROD_VERSIONS[0]);
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });

  it("falls back, loudly, when the named version is not registered", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(resolvePublicVersion("v0.0.0-nonexistent")).toBe(PROD_VERSIONS[0]);
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });

  it("refuses a design version, whatever the deployment says", () => {
    // One that has not been promoted: a design version whose id a production version also
    // carries resolves to the production one, which is correct and is not this rule.
    const design = DESIGN_VERSIONS.find((version) => !findVersion(version.id, "prod"));

    if (!design) return; // nothing to refuse until the first unpromoted design version exists

    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(resolvePublicVersion(design.id)).toBe(PROD_VERSIONS[0]);
    expect(error).toHaveBeenCalled();

    error.mockRestore();
  });
});
