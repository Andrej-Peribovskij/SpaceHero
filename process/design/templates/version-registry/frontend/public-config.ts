/*
 * Reference copy from process/design/templates/version-registry/. Yours once copied.
 * THIS FILE IS YOURS. It is written once and never regenerated: it is the one place the
 * version machinery touches this project's API. Everything that reads it is package-owned.
 */

/**
 * Where the public UI version comes from.
 *
 * `PUBLIC_UI_VERSION` is the only piece of this app's configuration that is *not* baked into
 * the bundle. It is read by the API from its own environment on every request, so moving the
 * public version is an environment line plus an API restart and no frontend rebuild — which is
 * what makes prompt 06's flip and its rollback one line each. Baking it would turn both into a
 * rebuild, and a deployment that cannot reach its package registry cannot rebuild itself.
 *
 * See `docs/design-version-registry.md` §"The runtime contract"
 * for what the endpoint must answer, and `templates/version-registry/backend/` for a reference
 * implementation to copy into your API.
 */

/** The endpoint. Unauthenticated: it gates first paint, before there is a session to ask with. */
const PUBLIC_CONFIG_URL = "__PUBLIC_CONFIG_PATH__";

/**
 * The public UI version this deployment names, or nothing.
 *
 * Relative by default, so a dev proxy and a same-origin deployment both work untouched. If
 * this app's API lives on another origin, prefix the URL with whatever already holds that base
 * — e.g. `` `${getRuntimeConfig().apiUrl}${PUBLIC_CONFIG_URL}` `` — and change nothing else.
 *
 * Deliberately swallows every failure. This resolves before first paint, so a rejection here
 * would take the whole app down over a value only the router needs, and one that has a defined
 * fallback. A deployment whose config endpoint is unreachable should still be able to sign
 * somebody in and show them the previous version's screens.
 *
 * Uses `fetch` directly rather than this project's API client: that client will usually want
 * configuration of its own, and a client awaiting the config it is being used to fetch never
 * resolves.
 */
export async function fetchPublicUiVersion(): Promise<string | undefined> {
  try {
    const response = await fetch(PUBLIC_CONFIG_URL);

    if (!response.ok) {
      console.error(
        `GET ${PUBLIC_CONFIG_URL} answered ${response.status}. `
          + "Falling back to the first registered production version.",
      );
      return undefined;
    }

    const body: unknown = await response.json();
    const version = (body as { publicUiVersion?: unknown }).publicUiVersion;

    // An empty string is what an unconfigured deployment answers with, and it means the same
    // thing as an absent field: nobody has said which version is public. Normalised to absent
    // here so there is one such value, not two.
    return typeof version === "string" && version.length > 0 ? version : undefined;
  } catch (error) {
    console.error(
      `Could not reach GET ${PUBLIC_CONFIG_URL}. `
        + "Falling back to the first registered production version.",
      error,
    );
    return undefined;
  }
}
