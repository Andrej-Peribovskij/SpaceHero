/*
 * Reference copy from process/design/templates/version-registry/.
 * Process-owned: keep it in step with the reference rather than editing it in place.
 * Bind it to this project's API in ./public-config.ts, and to its versions in ./registry.tsx.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchPublicUiVersion } from "./public-config";
import { findVersion, PROD_VERSIONS, type VersionEntry } from "./registry";

/**
 * Which version is served unprefixed at the root — the one real users see.
 *
 * The fail-safe, and the context default: the first registered production version. A component
 * that renders without a provider — every view test does — gets the incumbent app, which is
 * what those tests are about.
 */
const FALLBACK: VersionEntry = PROD_VERSIONS[0]!;

const PublicVersionContext = createContext<VersionEntry>(FALLBACK);

export function usePublicVersion(): VersionEntry {
  return useContext(PublicVersionContext);
}

/**
 * Resolves which version is public before the router renders.
 *
 * This has to be known first. Every canonical path ("/briefing") is unresolvable until we know
 * whose route table to match it against, so the app blocks first paint on the value rather than
 * guessing and re-rendering — a guess would flash one version's screen before replacing it with
 * another's, on the one screen a user has no way to interpret.
 *
 * One round-trip. If first paint measurably suffers, the fix is to inject the value into
 * `index.html` at serve time, not to bake it into the bundle: baking it is what makes prompt
 * 06's rollback a rebuild instead of a line.
 */
export function PublicVersionProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  /** What to show for the one round-trip. Defaults to a dependency-free skeleton. */
  fallback?: ReactNode;
}) {
  const [version, setVersion] = useState<VersionEntry | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchPublicUiVersion().then((named) => {
      if (cancelled) return;

      setVersion(resolvePublicVersion(named));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return <>{fallback ?? <BootSkeleton />}</>;

  return <PublicVersionContext.Provider value={version}>{children}</PublicVersionContext.Provider>;
}

/**
 * Which version the named one is, or the fallback and a reason.
 *
 * Three ways to be wrong, and all three are loud. None of them stops the app rendering: a
 * frontend that cannot resolve a public version cannot serve a single unprefixed path, so
 * refusing to render would turn a misconfigured value into an outage.
 */
export function resolvePublicVersion(named: string | undefined): VersionEntry {
  const known = PROD_VERSIONS.map((v) => v.id).join(", ");

  if (!named) {
    // Absent rather than wrong: either the deployment set nothing, or the config endpoint could
    // not be reached — public-config.ts has already said which.
    console.error(
      `No public UI version is configured. Falling back to "${FALLBACK.id}". `
        + `Set PUBLIC_UI_VERSION on the API to one of: ${known}.`,
    );
    return FALLBACK;
  }

  // Production only, and by kind rather than by id alone: a promoted version keeps the name of
  // the design version it came from, and both stay registered.
  const resolved = findVersion(named, "prod");

  if (resolved) return resolved;

  /*
    A design version is refused rather than honoured, and this is the case worth being loud
    about. Design versions run on mock data behind an administrator-only mount; serving one at
    the root would show real users invented figures that look exactly like real ones. Prompt 06
    is the only way a version becomes public, and it only ever names a production version.
  */
  if (findVersion(named, "design")) {
    console.error(
      `PUBLIC_UI_VERSION="${named}" names a design version, which cannot be public — `
        + `design versions are mocked and administrator-only. Falling back to "${FALLBACK.id}". `
        + `Production versions: ${known}.`,
    );
    return FALLBACK;
  }

  console.error(
    `PUBLIC_UI_VERSION="${named}" is not in the version registry. `
      + `Falling back to "${FALLBACK.id}". Production versions: ${known}.`,
  );
  return FALLBACK;
}

/**
 * The one screen that must depend on nothing the configuration gates: no design system, no
 * tokens, no fonts, no API. It is what a visitor sees for one round-trip, and if it needed any
 * of those it would be blank exactly when they are missing.
 */
function BootSkeleton() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh", background: "#fff" }}>
      <span style={{ font: "400 13px/1 system-ui, sans-serif", color: "#6b7280" }}>Loading…</span>
    </div>
  );
}
