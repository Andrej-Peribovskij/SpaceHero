// Reference implementation from process/design
// (templates/version-registry/backend/node). Copy into your API.
//
// Express:  app.get("/api/v1/public-config", publicConfigHandler);
// Fastify:  fastify.get("/api/v1/public-config", async () => publicConfig());

/**
 * The frontend's runtime configuration, for the values it needs before it can render anything.
 *
 * There is exactly one such value: which UI version is public. Every canonical path
 * ("/briefing") is unresolvable until it is known — the route table to match against belongs to
 * a version — so the app blocks first paint on this response rather than guessing and
 * re-rendering.
 *
 * Unauthenticated on purpose: it gates first paint, and it is asked before there is a session to
 * ask with. Nothing secret may ever be added to this response.
 */
export interface PublicConfig {
  publicUiVersion: string;
}

/**
 * Which version is public, read from the environment on **every call**.
 *
 * Not captured into a module-level constant, and not baked into the frontend bundle. That is
 * the whole point: moving the public version is an environment line plus an API restart, with
 * no frontend rebuild, which is what makes the design → code process's prompt 06 flip and its
 * rollback one line each. A deployment that cannot reach its package registry cannot rebuild
 * itself, so a baked value could never be changed in place.
 *
 * `PUBLIC_UI_VERSION` outranks the `PUBLIC_UI_VERSION_DEFAULT` a repository may commit: prompt
 * 06 and every runbook say `PUBLIC_UI_VERSION=…`, and an operator moving the public version
 * must not be silently outranked by a committed default.
 *
 * Empty is a legitimate answer, meaning "this deployment names no version" — the frontend falls
 * back to its first registered production version and says loudly that it did.
 */
export function publicConfig(env: NodeJS.ProcessEnv = process.env): PublicConfig {
  const named = env.PUBLIC_UI_VERSION?.trim() || env.PUBLIC_UI_VERSION_DEFAULT?.trim() || "";

  return { publicUiVersion: named };
}

/**
 * Express-shaped handler.
 *
 * `Cache-Control: no-store`, deliberately: a cached answer would outlive the restart that
 * changed it, and prompt 06's rollback would appear not to work.
 */
export function publicConfigHandler(
  _request: unknown,
  response: { setHeader(name: string, value: string): void; json(body: unknown): void },
): void {
  response.setHeader("Cache-Control", "no-store");
  response.json(publicConfig());
}
