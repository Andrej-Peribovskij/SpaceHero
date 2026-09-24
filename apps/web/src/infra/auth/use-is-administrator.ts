import { useQuery } from "@tanstack/react-query";

import type { components } from "@my-app/schemas/api-v1";
import { apiJson } from "../http/client";

/**
 * The contract type, not a hand-written copy: generated from the committed OpenAPI
 * snapshot, so a change to the endpoint's shape breaks this at compile time.
 */
export type Me = components["schemas"]["MeResponse"];

/**
 * The capability that grants the prefixed, non-public version mounts.
 *
 * Mirrors `PlatformCapabilities.DesignVersionsPreview` in the API. Dotted rather than a
 * bare "admin" because ADR-0003 fixes capabilities as names for what an actor may DO — and
 * a template that shipped "admin" would teach every generated project the opposite of the
 * decision it also ships.
 */
export const DESIGN_VERSIONS_PREVIEW = "platform.design-versions.preview";

/** The caller's own identity and capabilities. Anonymous-safe: a logged-out visitor gets 200. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiJson<Me>("/me"),
    // Who the caller is does not change between two renders of the same page, and this is
    // read by the route gate on every navigation.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * May the current caller reach the prefixed version mounts?
 *
 * Returns `undefined` while the answer is still loading, and that third state is
 * load-bearing rather than tidy. `RequireAdministrator` renders nothing for `undefined` and
 * redirects for `false`; collapsing the two would bounce an administrator off their own URL
 * whenever the gate rendered before this request resolved — a race that shows up as an
 * intermittent bug on exactly the deployments with the slowest API.
 *
 * A failed request is `false`, not `undefined`: the endpoint answers anonymous callers, so a
 * failure is a real failure, and the safe reading of "I could not establish that you are an
 * administrator" is that you are not one.
 */
export function useIsAdministrator(): boolean | undefined {
  const { data, isPending } = useMe();

  if (isPending) return undefined;

  return data?.capabilities.includes(DESIGN_VERSIONS_PREVIEW) ?? false;
}
