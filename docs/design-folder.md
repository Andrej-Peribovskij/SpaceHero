# The design folder

## Layout

```
packages/hub/frontend/src/
  versions/                    the registry — see design-version-registry.md
    registry.tsx               the version table          ← the project's
    public-config.ts           where PUBLIC_UI_VERSION comes from   ← the project's
    registry-core.ts           types + the rules          ← the process's
    public-version.tsx         which version is public    ← the process's
    version-base.tsx           navigation without prefixes ← the process's
    mount.tsx                  every route, for the router ← the process's
    registry.contract.test.ts  the contract, enforced     ← the process's
  pages/
    legacy/                  re-namespaced v1-era surfaces
    v3/                      a prod version
    design/
      v4.0.0/
        components/          composites specific to this version
        data/                mock data, colocated
        screens/
      v4.1.0/
      pt-v1.0.0-tech/
        components/
        screens/
        api.ts               a wired version owns its client
        types.ts             and its wire contract
        BACKEND.md           and points at the service it cannot contain
```

Route specs live in `versions/registry.tsx`, not in a per-version `index.ts`. They have to: the
`React.lazy` loaders are what the build flag eliminates, and they can only be eliminated if they
sit inside the flag-guarded branch of the registry itself. A version's folder holds screens, not
routing.

A design version is **self-contained**: it owns its screens, its composites and its mocks, and it
imports nothing from another version's folder. Two design versions never share code — copying is
correct here, because versions must be deletable independently.

Self-contained does **not** mean isolated. A version imports freely from:

- the design system (`@my-app/design-system`, and its staging subpath) — `DS_PACKAGE_NAME` in
  the wrapper bindings
- **application infrastructure** — the auth context, the version-navigation hooks, shared
  geometry and formatting utilities, the shared type package, the request transport

Application infrastructure is not a version. Banning it would be self-defeating: `useVersionNav`
is *how* Invariant 1 is satisfied, and a version that re-implemented auth would be a fork of the
app, not a design of it. The line is ownership, not distance — if deleting the version should
delete the code, the code belongs inside the folder; if the code would survive because the rest
of the app needs it, it belongs outside.

The test to apply is: **can this folder be deleted in one `rm -rf` without breaking anything
else, and without leaving anything of its own behind?** A shared page-level composite fails that
test in both directions and must be copied in. A wired version's API client fails it too — it
belongs in the version, not in the shared client.

---

## The registry

`src/versions/registry.tsx` is the single source of truth. Routing, the access gate, the landing
redirect, the version switcher and analytics suppression all read from it.

**Most of it is not written by hand** — it is copied from
`process/design/templates/version-registry/`. What follows is the shape; the full contract, the
ownership split between this app's files and the process's, and what the contract test enforces
are in [`design-version-registry.md`](design-version-registry.md).

```ts
type VersionKind = "prod" | "design";

interface RouteSpec {
  path: string;                    // RELATIVE — "start", "project/:eventId", "" for the entry
  component: ComponentType;        // the component, not an element: design routes are lazy()
  guard: RouteGuard;               // a name from this project's own union — the app maps it
}

interface VersionEntry {
  id: string;                      // "v3" | "v4.0.0" | "v4.1.0-tech"
  kind: VersionKind;
  wired: boolean;                  // true = talks to real backends
  label: string;                   // for a version switcher
  entryRoute: string;              // relative, e.g. "" or "start", and one of `routes`
  routes: RouteSpec[];
}

export const PROD_VERSIONS: VersionEntry[];    // always in the build, imported directly
export const DESIGN_VERSIONS: VersionEntry[];  // dropped when INCLUDE_DESIGN_VERSIONS is false
export const VERSIONS = [...PROD_VERSIONS, ...DESIGN_VERSIONS];
// order is meaningful — see versioning.md
```

Route paths are declared **relative to the version's own base**. No entry ever contains `/v3` or
`/design/…`. The router adds the prefix when it mounts.

### Dual mount

Each version is mounted twice:

- **canonical**, at the root — only for the version named by `PUBLIC_UI_VERSION`
- **prefixed**, at `/v3` or `/design/v4.0.0` — for every version, administrators only

---

## Invariant 1 — no hardcoded version prefixes

**This is the invariant everything else rests on.**

Pages navigate through the version base, never through a literal:

```ts
// WRONG — leaks the version into a public user's URL bar
navigate("/v3/briefing");
navigate(`/v3/project/${event.id}`);

// RIGHT — resolves to "/briefing" canonically, "/v4/briefing" for current v4's alias
const nav = useVersionNav();
nav("/briefing");
nav(`/project/${event.id}`);
```

The same applies to `<VersionLink>` in place of `<Link>`, and to any stored redirect path, which
must be stored **base-relative**.

Why it matters: a public user is on `/start`. They click a button whose handler says
`navigate("/v3/briefing")`. They are thrown to a versioned URL — the thing this architecture
exists to hide — which then redirects them back. One missed literal breaks the model, and it is
invisible until a user clicks that specific button.

### Enforcement

An ESLint rule bans string and template literals matching `^/v\d` or `^/design/` inside
`src/pages/**`. It is not optional polish; it is the acceptance criterion. It lives in
`eslint.config.mjs` at the repository root and runs as `apps/web`'s `lint`.

The rule catches literals, and the routing E2E suite catches what the rule cannot see —
navigation composed at runtime. `"/v" + n + "/briefing"` passes the rule, which is not a bug in
the selector but the reason the suite is not a duplicate of it.

---

## Invariant 2 — a design version declares its wiredness

Every entry carries `wired`, and it must be true to the code. **Check the field, never the folder
path** — that is the whole reason the field exists.

A version created by prompt 01 is created **mocked**: `wired: false`, no real service call, data
in `data/*.ts` colocated. That is the default, and the only default.

Two kinds of version legitimately declare `wired: true`:

- a **`-tech`** version, which is a designer's version revised while being wired to real
  backends, and is backend-wired by definition
- a version **absorbed from existing app code** that was already wired when it was moved into
  `design/`. Mocking it out on the way in would throw away the one working reference of how those
  screens talk to their backends — which is precisely what the next `-tech` revision needs

What is *not* acceptable is a `wired` value that lies. If a version talks to a real service, it
says so, and the consequences follow from the field: a wired version writes real records, so
clicking through it is not a dry run.

A wired version owns its client. If it talks to a service the rest of the app does not, that
service's prefix and API surface live **in the version's folder**, not in the shared client — see
the deletability test above. Document the service it depends on in a `BACKEND.md` beside the
screens: a deployable service cannot live under `src/pages/`, so the folder needs a pointer to
the half that stays put, and to what has to be decided separately if the version is ever deleted.

Analytics suppression (Invariant 4) keys off `kind`, deliberately **not** `wired`. A wired design
version is still not production traffic.

---

## Invariant 3 — design versions are lazy

Every route element in a design version is a `React.lazy` import, so design code is emitted as
separate chunks and never enters the public entry bundle.

Additionally, `INCLUDE_DESIGN_VERSIONS=false` at build time drops `pages/design/**` entirely. The
VM is a staging environment and builds with `true` so technologists can review design versions
live; `false` is reserved for a future real production build.

Lazy loading is not a security boundary — the access gate is client-side and the chunks are
fetchable by anyone who guesses the URL. The build flag is the real exclusion. Treat the gate as
convenience and the flag as the control.

---

## Invariant 4 — design versions emit no analytics

Analytics capture is suppressed when the active version's `kind === "design"`. Otherwise design
traffic pollutes production metrics.

For prod versions, the version prefix is **normalised out** of captured pathnames and the version
is sent as a **property** instead. A public user emits `/start` and an administrator emits
`/v3/start` for the same screen; without normalisation every funnel fragments in two.

---

## Adding a design version

Done by prompt 01, not by hand. In outline:

1. Create `pages/design/vX.Y.Z/` with the version's screens, composites and mocks
2. Append an entry to `VERSIONS` inside the `INCLUDE_DESIGN_VERSIONS` branch, with one
   `React.lazy` loader per route and all paths relative — appended, because array position is
   the ordering
3. Point its imports at the design-system staging subpath for any new or changed components
4. Declare `wired` truthfully. If it is `true`, the version also owns its API client and carries
   a `BACKEND.md`

Nothing in `App.tsx` changes. If a version requires editing the router, the registry is not doing
its job.

---

## Deleting a design version

Done by prompt 07, on an explicit manual trigger only, and only for a version already promoted
into a prod version. Never automated, never inferred.
