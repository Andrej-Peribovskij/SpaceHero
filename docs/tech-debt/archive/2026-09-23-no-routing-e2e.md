# The routing E2E is not written

**Created:** 2026-09-22
**Resolved:** 2026-09-23
**Module:** apps/web / testing

> **Resolved.** The suite is written. Numbering below is the old six-item list this record was
> written against; `docs/design-testing.md` §1 now lists four and renumbers them.
>
> - Old tests 1, 2 and 4 → `tests/e2e/flows/routing.spec.ts`, against the ordinary stack.
> - Old test 5 → `tests/e2e/design-preview/administrator-mounts.spec.ts`, a second Playwright
>   project whose web server is `pnpm run design:preview`, exactly as this record proposed.
>   `scripts/design-preview.mjs` gained a `DESIGN_PREVIEW_WEB_PORT` so the runner has a URL to
>   wait on instead of vite's own choice.
> - Old test 3 (a share link `/vX/p/:token`) → **dropped.** This product has no share links, and
>   a test against an invented route proves the invention. The behaviour a share link needs —
>   `RequireAdministrator` keeping the subpath and query rather than dumping the visitor at the
>   root — is still asserted, so the rule survives the test's removal.
> - Old test 6 (`PUBLIC_UI_VERSION` changes which version answers at the root) → **dropped for
>   now.** One production version is registered, so the test would assert that `v1.0.0` still
>   answers after being told to serve `v1.0.0`. It returns by itself when prompt 02 registers a
>   second; it is not debt in the meantime, it is a test of something that does not exist.
>
> §1 now lists four tests and all four exist, which is the condition this record was holding out
> for: a suite called "the routing E2E" covering the redirects and not the switch would have read
> as done without being done.
>
> The rest of this record is kept as written on 2026-09-22.

## What

`docs/design-testing.md` §1 calls the routing E2E "the acceptance criterion for the dual-mount
architecture" and lists roughly six tests. None of them exist. What exists is
`apps/web/src/versions/routing.test.tsx`, which covers the same contract at component level,
with the router rendered in jsdom and the API mocked.

That is not the same thing, and §1 says why: the rule against hardcoded version prefixes bans
*literals*, but navigation composed at runtime — a path assembled from a variable, a redirect
read from storage — is invisible to static analysis and to a component test that never
composes a real URL. Only a browser catches it.

Three of the six are writable against the app as it stands today:

| # | Test | Writable now |
| --- | --- | --- |
| 1 | a non-administrator walks the public flow and the URL never matches `/v\d\|/design/` | yes |
| 2 | a prefixed path redirects a non-administrator to the canonical one | yes |
| 4 | a `/design/…` path redirects a non-administrator to the canonical root | yes |
| 3 | a share link `/vX/p/:token` resolves for a non-administrator, preserving the token | no route in this template serves one |
| 5 | an administrator reaches both the canonical and the prefixed mount | no way to *be* one in a browser |
| 6 | changing `PUBLIC_UI_VERSION` changes which version answers at the root | one production version is registered |

Test 5 is the interesting one. `apps/web/src/infra/http/client.ts` attaches no bearer token, so
a browser is always anonymous against the real API and `GET /api/v1/me` always answers with no
capabilities. The integration suite mints a token because it is the HTTP client; a Playwright
run is not.

## Why

The gap is not laziness about writing three specs. Half the list needs app surface that a
template has no business inventing: a second registered production version exists only to be
switched between, and a share-link route exists only if a product has share links. Writing
tests 1, 2 and 4 alone would leave the suite named "routing E2E" covering the redirects and
not the switch — which reads as done and is not.

Test 5 also has a real answer now that did not exist when this was first noted:
`scripts/design-preview.mjs` serves a synthetic administrator, so a Playwright project pointed
at it gets an administrator browser with no auth backend. That is a seam the suite can use, and
it is why this record is worth keeping rather than closing as "needs a login flow".

## Resolution

In one change, so the suite is never half a claim:

1. Register a second production version in `apps/web/src/versions/registry.tsx`, or decide
   deliberately that the template ships one and drop test 6 from §1 with the reason.
2. Add `tests/e2e/flows/routing.spec.ts` with tests 1, 2 and 4 against the ordinary stack.
3. Add a second Playwright project whose web server is `pnpm run design:preview`, for test 5.
   The stub answers `/me` as an administrator, so the prefixed mount is reachable; a version
   that reads anything else gets a 501, which keeps the project honest about being
   frontend-only.
4. Decide about test 3 — a share-link route is product surface, and if this template has none,
   §1 should say so rather than listing a test nobody can write.

Until then `design-commands/README.md`'s checklist carries it as `[~]`, which is "partly, and
the gap is named" — not a box that will ever be ticked by accident.
