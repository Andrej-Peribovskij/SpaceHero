# The version registry

The single source of truth for which UI versions exist, what each one serves, and which one the
world sees. Everything else in this process — clean public URLs, administrator-only design
versions, a one-line promotion and a one-line rollback — is a consequence of this module
existing and being obeyed.

It is **not** optional, and it is **not** a screen-by-screen decision. It lives at
`apps/web/src/versions/`, copied from
[`process/design/templates/version-registry/`](../process/design/templates/version-registry/)
and held to the contract below. This app has versions the process has never heard of; it does
not get a *different kind of registry*.

> **Why a copied reference rather than a specification.** The process reports a missing
> requirement and never invents one, because the other requirements are architectural
> decisions. The registry is the exception, deliberately: it is not a decision, it is the
> process's own runtime, expressed as code that has to live inside the app to work. Four
> repositories writing it four times produced four subtly different fallbacks, and the
> difference only surfaces on the day a deployment names a version that does not exist.

---

## Layout

```
<FRONTEND_PACKAGE>/src/versions/
  registry.tsx                 the version table            ← yours
  public-config.ts             where PUBLIC_UI_VERSION comes from   ← yours
  registry-core.ts             types + the rules            ← the process
  public-version.tsx           which version is public      ← the process
  version-base.tsx             navigation without prefixes  ← the process
  mount.tsx                    every route, for the router  ← the process
  registry.contract.test.ts    the contract, enforced       ← the process
  README.md                    how to wire it in            ← the process
```

A process-owned file and its reference under `process/design/templates/version-registry/` are
meant to be identical. Change the reference, copy it down, review both halves in one commit —
an edit made only in `src/versions/` is a silent fork of the contract.

The two app-owned files are seeded once and never touched again. `registry.tsx` holds the
versions, the guard names and the reserved roots; `public-config.ts` holds the one call into
this app's API.

---

## The version table

```ts
type VersionKind = "prod" | "design";

interface RouteSpec<Guard extends string> {
  path: string;          // RELATIVE — "start", "project/:id", "" for the entry route
  component: ComponentType;
  guard: Guard;          // a name; only the app knows what it means
}

interface VersionEntry<Guard extends string> {
  id: string;            // "v1.0.0" | "v2" | "v2.1.0-tech"
  kind: VersionKind;
  wired: boolean;        // true = talks to real backends
  label: string;         // for a version switcher
  entryRoute: string;    // relative, and one of `routes`
  routes: RouteSpec<Guard>[];
}

export const PROD_VERSIONS: VersionEntry[];    // always in the build
export const DESIGN_VERSIONS: VersionEntry[];  // dropped when INCLUDE_DESIGN_VERSIONS is false
export const VERSIONS = [...PROD_VERSIONS, ...DESIGN_VERSIONS];
```

**The split into two arrays is load-bearing.** Design versions sit inside the
`INCLUDE_DESIGN_VERSIONS` branch so a build that opts out drops both the entries and, with them,
every `lazy()` import and therefore every chunk under `pages/design/**`. Production versions are
declared outside it and import their components *directly*: one of them is the app real users
get, so it must never be dropped by a build flag and must never arrive as a second round-trip
after first paint.

**Order is meaningful, and array position is the only ordering.** Never semver-sort. Under semver
precedence a `-tech` prerelease sorts *before* the version it revises — the exact inverse of the
truth. See [versioning.md](design-versioning.md).

**`PROD_VERSIONS[0]` is the fail-safe.** It is what the app serves when the deployment names no
version, names an unknown one, or names a design version. The oldest and most-proven entry comes
first for that reason, and it must be `wired`.

---

## The two mounts

Every version is mounted twice, by `mount.tsx`, from the same components:

- **canonical**, unprefixed at `/` — only the version named by `PUBLIC_UI_VERSION`
- **prefixed**, at `/v1.0.0` or `/design/v2.0.0` — every registered version, administrators only

A version is not a copy of the app per mount. The same component renders at both; what differs
is the base path it reads through `useVersionBase`.

**A route declares its own guard, in the registry** — not by wrapping the component at the mount,
and not inside the view. A prefixed mount adds the administrator gate *on top*; the route's own
guard still applies underneath, so going in through a prefix is never a way around the role a
screen asks for.

**A view brings its own frame.** The registry holds components, not layouts. A shell or chrome
component is imported by the view that needs it — a table that composes one screen differently
from the rest cannot be a data structure.

A non-administrator who lands on a prefixed path is redirected to the canonical equivalent,
**preserving subpath, params and query** where the public version serves that shape, and landing
on its entry route where it does not. This is one rule, not a hand-written redirect per retired
path — and it is what keeps outstanding share links of the form `/v3/p/:token` working for the
non-administrators who open them.

---

## Invariant — no hardcoded version prefixes

**This is the invariant everything else rests on.** Screens navigate through `useVersionNav`,
`useVersionPath` and `<VersionLink>`, never through a literal:

```ts
navigate("/v3/briefing");        // WRONG — leaks the version into a public user's URL bar
nav("/briefing");                // RIGHT — "/briefing" canonically, "/v3/briefing" on the alias
```

Any redirect the app persists must be stored **base-relative** (`stripVersionBase`), or it pins
the user to whichever mount they were on when it was written.

A public user is on `/start`. They click a button whose handler says `navigate("/v3/briefing")`.
They are thrown to a versioned URL — the thing this architecture exists to hide — which then
redirects them back. One missed literal breaks the model, and it is invisible until a user clicks
that specific button.

**Enforcement** is an ESLint rule banning `^/v\d` and `^/design/` literals inside `src/pages/**`.
It is not optional polish; it is the acceptance criterion. The rule catches literals, and the
routing E2E suite catches what the rule cannot see — navigation composed at runtime. In this
repository the rule is in `eslint.config.mjs` at the root and covers template literals too; the
generated `src/versions/README.md` shows its shape.

---

## Invariant — reserved roots

A production version mounts canonically as well as at its prefix, so it shares the root
namespace with the app shell. A version that introduced a page called `login` would shadow the
real login page — and would do so only once that version became public, long after it was
written.

`RESERVED_ROOT_PREFIXES` in `registry.tsx` lists every first path segment the shell owns. Keep it
in step with the app's own routes. `assertNoReservedRootCollisions()` throws on a collision; the
app calls it once at startup in development, and the contract test calls it on every commit.

Route segments shaped like a version prefix (`v2.0.0/compare`) are refused for the same reason
from the other direction: the prefix matcher claims such a path before the canonical mount can
serve it, so the screen could never render for a real user.

Design versions are checked too. They are candidates for promotion, and finding the collision now
is cheaper than finding it on the day someone copies them.

---

## Invariant — `wired` is true to the code

Every entry carries `wired`, and it must not lie. **Check the field, never the folder path** —
that is the whole reason the field exists. A version created by prompt 01 is created mocked
(`wired: false`); a `-tech` version and a version absorbed from already-wired app code are the
two that legitimately declare `wired: true`. See
[design-folder.md](design-folder.md#invariant-2--a-design-version-declares-its-wiredness).

Analytics suppression keys off `kind`, deliberately **not** `wired`: a wired design version is
still not production traffic.

---

## The runtime contract

`public-config.ts` fetches, and the API answers:

```
GET /api/v1/public-config     (unauthenticated)
→ { "publicUiVersion": "v1.0.0" }
```

Read **fresh per request** from the environment. Never captured at startup, never baked into the
frontend bundle: moving the public version has to be an environment line plus an API restart,
with no frontend rebuild, because that is what makes prompt 06's flip and its rollback one line
each — and because a deployment that cannot reach its package registry cannot rebuild itself.

**Do not add a build-time variable for it** — no `VITE_PUBLIC_UI_VERSION` or equivalent, however
convenient it looks in a dev setup. A frontend that can read the version from its own build has
two answers to the question, and the wrong one wins on the day it matters. A project whose other
configuration is baked at build time (a common and defensible choice) grants this one value an
explicit exemption and records why.

Three answers the frontend refuses, each falling back to `PROD_VERSIONS[0]` and each logged
loudly:

| Answer | Why refused |
|---|---|
| absent or `""` | the deployment named nothing, or the endpoint was unreachable |
| an unregistered id | nothing to serve |
| a **design** version's id | mocked and administrator-only; at the root it would show real users invented figures that look exactly like real ones |

None of the three stops the app rendering. A frontend that cannot resolve a public version
cannot serve a single unprefixed path, so refusing to render would turn a misconfigured value
into an outage.

Reference implementations for .NET and Node are in
[templates/version-registry/backend/](../process/design/templates/version-registry/backend/). They are not
generated into the host: that endpoint is a decision about your service.

---

## What the contract test enforces

`registry.contract.test.ts` runs in the host's own suite and fails the build on any of these.
Every one of them breaks the public app quietly, and none is caught by the type system:

- `VERSIONS` is exactly `[...PROD_VERSIONS, ...DESIGN_VERSIONS]`
- there is at least one production version and `PROD_VERSIONS[0].wired` is true
- no `(id, kind)` pair is registered twice
- every production id is version-shaped, so the prefix matcher recognises its mount
- every route path is relative — no leading `/`, no `design/`
- every version has at least one route and repeats none
- every `entryRoute` names a route that version actually serves
- no version id or route shadows a reserved root
- every version's own base path resolves back to that version
- `resolvePublicVersion` resolves each production id, and falls back for an absent id, an
  unknown id and an unpromoted design version's id

Write this project's own registry tests — what a version serves, which guard a screen sits
behind — in a separate `registry.test.ts` beside it. The contract file is regenerated.

---

## Adding, promoting and removing versions

Never by hand. Prompt 01 appends a design version, prompt 02 promotes one to a production
version, prompt 06 moves `PUBLIC_UI_VERSION`, prompt 07 deletes a promoted design version on an
explicit manual trigger. Nothing in the app router changes for any of them.

"Never by hand" now includes the flip itself: prompt 06 applies it with
`pnpm run public-version:set <version>`, which writes every place this repository declares the
public version. The *decision* stays a person's, gated on a change report they have read — what
stopped being manual is finding two files in two syntaxes and remembering both.

**If a version requires editing the router, the registry is not doing its job.**

### If the host repository runs a change-management workflow

Two of the seven prompts change what real users get: **02**, when a version starts reading and
writing real records, and **06**, when every real user's UI changes at `/`. If the host repository
records user-facing capability changes — an ADR log, an OpenSpec change, an RFC, a ticket
workflow — each of those two needs its **own** record, and 02's must exist before its copy step.

Two records for a wire-then-flip, never one. Folding the flip into the wiring record keeps that
record open until `PUBLIC_UI_VERSION` moves, which may be weeks later or never — the flip being
one line and reversible is the point. Separate records let the wiring close on its own merit and
make the flip its own reviewed, dated decision, which is what prompt 06 is built around.

This process does not prescribe *which* workflow, and prompts 01, 03, 04, 05 and 07 need no
record: they touch mocked, administrator-only work or a design system's own publish gate.
