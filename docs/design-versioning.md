# Versioning

## Two kinds of version

| | **Prod version** | **Design version** |
|---|---|---|
| Identifier | `v3`, `v4`, `v5` | `v4.0.0`, `v4.1.0`, `v4.1.0-tech` |
| Lives in | `src/pages/v4/` | `src/pages/design/v4.0.0/` |
| Data | real backends | mocked (except `-tech`) |
| Reachable at | `/…` when public, `/v4/…` as its administrator alias | `/design/v4.0.0/…` only |
| Created by | prompt 02 | prompt 01 |

A prod version is created by *promoting* a design version through prompt 02. Design versions are
free; prod versions are deliberate.

---

## `vX.Y.Z`

| Part | Increment when | Example |
|---|---|---|
| **X** | a new design language, or a reworked flow | `v4.0.0` → `v5.0.0` |
| **Y** | new screens or flow additions within the same design language | `v4.0.0` → `v4.1.0` |
| **Z** | refinements to existing screens | `v4.1.0` → `v4.1.1` |

Prompt 01 asks the designer which increment to take. It never guesses.

**The increment only names the new version — it does not seed its code.** A new design version is
numbered relative to the last plain `vX.Y.Z` in its family (its *numbering predecessor*), but it is
**built from the canonical public version** — the one named by `PUBLIC_UI_VERSION`, the current
production-ready truth. Its conventions, patterns, architecture and utilities come from canonical,
never from the predecessor design version, which froze when it was approved and may be stale
relative to the production-hardening done on canonical since. Numbering predecessor and code
baseline are two different things; see prompt 01 §1.1 and §2.

---

## The `-tech` suffix

`vX.Y.Z-tech` is a design technologist's revision of `vX.Y.Z`: UX refinements discovered while
wiring it to real backends, sent back for designer review.

A `-tech` version is the one design version that **is** backend-wired. That is why the registry
carries a `wired: boolean` field — the mock-only rule is a *property* of a version, not an
implication of its folder. `wired` is what tooling and lint rules check, never the path.

### `-tech` is an opaque label

**Never feed these strings to a semver comparator.** Under semver precedence, `4.1.0-tech` is a
prerelease and sorts *before* `4.1.0` — the exact inverse of the truth, since a tech revision
always comes after the version it revises.

Versions are ordered by **their position in the registry array**. That array is the ordering, and
the only ordering. If you need "the latest design version", take the last matching entry; do not
sort.

---

## `PUBLIC_UI_VERSION`

A single value naming the one version real users can see.

- Set in the deployment's environment file: `PUBLIC_UI_VERSION=v4`
- Served from the backend's runtime config endpoint as `publicUiVersion`
- **Not** a build-time constant, and deliberately **not** `VITE_`-prefixed

Build-time baking is the trap here. A deployment that cannot reach the package registry cannot
rebuild its own frontend, so a baked value can never be changed in place. Served at runtime, the
public version changes with an environment edit and a backend restart.

Only a prod version may be public. Design versions are never eligible.

Moving it is prompt 06, and the **decision** is never automatic — wiring a version and publishing
it to the world are two separate decisions, and the prompt gates the second on a change report a
person has read.

The **typing** is. This repository declares the value in two committed places, in two syntaxes:
`Public:UiVersion` in `services/api/src/Host/appsettings.Development.json`, which is what
`pnpm run dev`, the E2E suite and `pnpm run design:preview` read, and the `PUBLIC_UI_VERSION`
default in `infra/compose/compose.yml`, which is what `pnpm run stack:up` reads.

```bash
pnpm run public-version              # what each one says now
pnpm run public-version:set v2.0.0   # write both, and print the deployment line
```

A guard test fails if the two ever disagree — one moving without the other means `pnpm run dev`
and `pnpm run stack:up` serve different applications with nothing saying so.

A deployment is not one of those places and cannot be. Its `PUBLIC_UI_VERSION` lives where that
environment is configured, and the flat variable outranks both files above. Keeping it out there
is what makes a rollback a restart rather than a pull request.

---

## URL model

| Path | Who | Notes |
|---|---|---|
| `/briefing` | everyone | canonical. The public version, no prefix. |
| `/v3/briefing` | administrators | the same screen, explicitly versioned, for development |
| `/design/v4.1.0/briefing` | administrators | a design version |
| `/legacy/review/:id` | as before | re-namespaced v1-era surfaces |

Redirect rules for non-administrators:

```
canonical path                    → allow
/vX/… where vX == PUBLIC          → canonical equivalent, preserving subpath, params, query
/vX/… or /design/… otherwise      → best-effort path mapping onto the public version,
                                     falling back to canonical root
```

The second rule matters more than it looks: persona share links of the form `/v3/p/:token` are in
circulation and are opened by reviewers who are not administrators. Preserving path and params
keeps every outstanding invitation working.

---

## Reserved root namespace

Because the public version mounts at the root, its routes share the namespace with the
application's own top-level paths. These prefixes are reserved and a version may not claim them:

```
login   register   register-success   admin   design   legacy
api     ws         assets             v[0-9]+
```

The registry asserts this at startup and throws in development on a collision. Without the
assertion, a design version introducing a page called `login` would silently shadow the real
login page.
