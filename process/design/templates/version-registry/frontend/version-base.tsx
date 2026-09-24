/*
 * Reference copy from process/design/templates/version-registry/.
 * Process-owned: keep it in step with the reference rather than editing it in place.
 */

import { createContext, useCallback, useContext } from "react";
import { Link, useNavigate, type LinkProps, type NavigateOptions } from "react-router-dom";

/**
 * How a screen navigates without knowing which mount it is on.
 *
 * This is the machinery behind Invariant 1 — no hardcoded version prefixes. A page that says
 * `navigate("/v3/briefing")` throws a public user onto a versioned URL, the one thing this
 * architecture exists to hide, and it is invisible until somebody clicks that specific button.
 * A page that says `nav("/briefing")` resolves to "/briefing" canonically and "/v3/briefing" on
 * the alias, from the same source.
 */

/** The current mount's base path: "" for canonical, "/v3" or "/design/v4.0.0" when prefixed. */
export const VersionBaseContext = createContext<string>("");

/** The mounted version's base path. "" when canonical. */
export function useVersionBase(): string {
  return useContext(VersionBaseContext);
}

/** Resolve a base-relative path ("/briefing") against a mount base ("/v3"). */
export function joinVersionPath(base: string, path: string): string {
  if (!path || path === "/") return base || "/";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * Strip a version base off an absolute path, giving the base-relative form safe to persist.
 *
 * A stored redirect ("where the user was going before we asked them to sign in") must be
 * base-relative, or it pins the user to whichever mount they happened to be on when it was
 * written. Paths that do not sit under the base — the login screen, anything the app shell
 * owns — are returned unchanged.
 */
export function stripVersionBase(base: string, path: string): string {
  if (!base || !path.startsWith(base)) return path;
  return path.slice(base.length) || "/";
}

/**
 * Resolve a base-relative path to an absolute one.
 *
 * Needed on its own, not only wrapped in a navigate: some navigation is a full document load
 * rather than a router push, and that needs a real URL string.
 */
export function useVersionPath(): (path: string) => string {
  const base = useVersionBase();
  return useCallback((path: string) => joinVersionPath(base, path), [base]);
}

/**
 * `navigate`, but taking a path relative to the mounted version's base.
 *
 *   nav("/briefing")  →  "/briefing" canonically, "/v3/briefing" on v3's alias
 */
export function useVersionNav(): (path: string, options?: NavigateOptions) => void {
  const base = useVersionBase();
  const navigate = useNavigate();
  return useCallback(
    (path: string, options?: NavigateOptions) => navigate(joinVersionPath(base, path), options),
    [base, navigate],
  );
}

/**
 * `<Link>`, but `to` is relative to the mounted version's base.
 *
 * Only string `to` values are accepted: a `Partial<Path>` would need every field rewritten and
 * no call site wants one.
 */
export function VersionLink({ to, ...rest }: Omit<LinkProps, "to"> & { to: string }) {
  const versionPath = useVersionPath();
  return <Link to={versionPath(to)} {...rest} />;
}
