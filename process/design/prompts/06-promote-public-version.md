# 06 — Promote a version to public

**Run by** the design technologist.

Moves `PUBLIC_UI_VERSION` — the single runtime value that names the one version real users see. This
is the moment the world's application changes.

**The decision is never automatic** and never a side effect of any other prompt: wiring a version
(prompt 02) and making it public are two separate, deliberate decisions, taken by a person who has
read what changes. Nothing in this prompt relaxes that.

**The edit is.** A host declares the public version in as many committed places as it has ways of
running — a settings file, a compose default, a chart value — and finding them by hand is how one
moves and the others do not. `PUBLIC_VERSION_APPLY_CMD` (§4a) writes all of them from one command.
That is a different thing from the promotion being automatic, and the two are worth keeping apart:
the gate is a person reading a report, not a person typing carefully.

The value is served at runtime, not baked at build time, and that is the entire point of the design.
Flipping it is an environment edit and a backend restart — **no frontend rebuild** — which is also
what makes the rollback a single line. Say so; operators should know the exit exists.

---

## Bindings

The command wrapper that invoked this prompt carries a bindings block. Read it before anything else.

| Binding | This repository |
|---|---|
| `APP_REPO` | `.` |
| `FRONTEND_PACKAGE` | `apps/web` |
| `PUBLIC_CONFIG_ENDPOINT` | `GET /api/public-config` → `publicUiVersion` |
| `PUBLIC_VERSION_APPLY_CMD` | the command that writes every in-repository declaration of `PUBLIC_UI_VERSION`, or `null` |
| `ENV_FILE` | the deployment's environment file that carries `PUBLIC_UI_VERSION`, or `null` when the host has none in the tree |

`PUBLIC_UI_VERSION` is read fresh per request from the environment by the runtime config endpoint —
**not** a `VITE_`-prefixed build constant. A deployment that cannot reach the package registry cannot
rebuild its own frontend, so a baked value could never be changed in place. This prompt depends on
that property; if the host bakes the version instead, stop — the architecture is not in place.

**On `PUBLIC_VERSION_APPLY_CMD`.** A host usually declares the public version in more than one
committed place — a development settings file, a compose default, a chart value — because those are
different runtimes reading different configuration. Editing them by hand is how one of them moves
and the others do not, which surfaces as two ways of running the app serving two different
applications. When the host provides this command, §4 runs it instead of editing anything by hand.

It does **not** make the promotion automatic, and nothing below is skipped because it exists: the
eligibility check, the change report, the human confirmation and the browser verification are the
prompt. The command replaces the typing in §4 and nothing else.

It also cannot reach a deployment, and must not try. A running environment's `PUBLIC_UI_VERSION` is
set where that environment is configured, which is outside the repository by construction — that
separation is what makes the flip reversible without a rebuild. The command prints the line to apply
there; a person applies it.

## Inputs

| Input | Notes |
|---|---|
| `TARGET_VERSION` | the prod version to make public, e.g. `v4`. Must be in the registry. |
| `ENVIRONMENT` | which deployment's `ENV_FILE` to change |

---

## The rules that do not bend

1. **Only a prod, wired version may become public.** A design version is never eligible; a mocked
   version is never eligible. Both are hard stops (§1).
2. **The change report is the gate — read, then confirmed.** There is no magic word here. The
   operator confirms after seeing exactly what gains, what is lost, and which live links break. A
   generic "ok" to an unread report is not confirmation.
3. **What reaches real users is an environment edit and a backend restart. No frontend rebuild, no
   redeploy, no registry.** §4a also writes the repository's committed declarations, and that is a
   commit — but the deployment does not wait for it, and must not. If you find yourself rebuilding
   the frontend to change the public version, or telling an operator to wait for a merge, the value
   is being treated as build-time and the whole model is broken — stop and report it.
4. **Verify as a non-administrator, in a browser.** The switch is for real users; an administrator
   sees every version regardless and would not notice a regression a normal user hits.

---

## 1. Eligibility check — hard stop on any failure

Check the target against the registry and the router. Any failure stops the prompt.

- **In the registry, `kind: "prod"`.** A design version (`kind: "design"`, including `-tech`) is
  never public. Read `FRONTEND_PACKAGE/src/versions/registry.tsx` and confirm.
- **`wired: true`.** A mocked version must never become public — real users would hit dead data.
  Check the field, never the folder path (that is why the field exists).
- **Every route it declares resolves, and none collides with a reserved root prefix.** When this
  version mounts at the root, its routes share the namespace with the app shell (`login`, `register`,
  `admin`, `design`, `legacy`, `api`, `ws`, `assets`, `v[0-9]+`). The registry asserts this at
  startup; confirm it holds for the target, because a collision that is harmless on the prefixed
  mount becomes a shadowed login page at the root.
- **The routing E2E suite passes with the target as the public version.** Run it configured so the
  target answers at the root. A suite that only ever ran with the *current* public version has not
  tested the target at the root at all.

  A host that has only ever had **one** production version may not have this test: with nothing to
  switch between it would have asserted that the current version still answers after being told to
  serve the current version, and a host is right to have left it out. This promotion is the moment
  it becomes writable, and writing it here is part of this step rather than a follow-up — the first
  switch is precisely the one nothing has ever covered. Check the host's testing document for
  whether the test exists before assuming it does.

**And build the frontend.** A green routing E2E suite says nothing about whether the target's chunk
actually builds — routes are lazy and the suite runs against a dev server, so a version with an
unresolvable import passes every routing test while failing `vite build` on the first module. The
public version is about to become the one everyone loads; prove it compiles:

```bash
pnpm --filter <frontend> build
pnpm --filter <frontend> typecheck        # the app's build does NOT typecheck; this does
pnpm --filter <frontend> test:e2e         # routing suite, with the target as public
```

## 2. Report what changes — before touching anything

Present, for the operator to read:

- **current public version → `TARGET_VERSION`.**
- **Screens gained, lost, or materially changed** — a table comparing the two versions' route sets.
- **Routes that exist today and will not exist after** — the live links that **break**. A URL a user
  has bookmarked or been sent under the *current* public version, whose path the target does not
  serve, stops resolving at the root the moment this flips. Enumerate them explicitly; this is the
  most important line in the report. (The off-version redirect does best-effort path mapping, but a
  path the target simply does not have falls back to the canonical root.)
- **The outgoing version stays reachable** at its prefixed mount for administrators (`/v3/…`). It is
  not deleted; it is no longer the *root*. Say so, so "going public with v4" is not misread as
  "losing v3".

## 3. Confirm

Present the report and **wait for explicit confirmation**. The report is the gate and it must be
read — a breaking-links list nobody looked at is the failure this step exists to prevent. Do not
proceed on a generic acknowledgement.

## 4. Apply

Two halves, and they are not the same act. The repository's own declarations are a commit; a
running deployment is an environment change somebody makes there.

**4a. The repository.** Run `PUBLIC_VERSION_APPLY_CMD` with `TARGET_VERSION` and paste its output.
It writes every place the repository declares the public version and reports each one, old → new.
Read that list rather than skimming it: a file it did *not* change is either already correct or a
declaration nobody told it about, and the second is worth finding now.

If the binding is `null`, the host has no such command — edit `ENV_FILE` by hand instead, and say
in the final report which files you edited, because that list is what such a command would be made
of later.

```bash
PUBLIC_VERSION_APPLY_CMD TARGET_VERSION    # each declaration, in whatever syntax that file uses
```

Commit that change with the rest of the promotion. It is a real change to the repository: it is
what a fresh clone, the E2E suite and every developer's local run will serve from now on.

**4b. The deployment.** In `ENVIRONMENT`'s own configuration, and then restart the backend:

```bash
PUBLIC_UI_VERSION=TARGET_VERSION
```

This is deliberately not something the command above can do: the flat
variable outranks anything committed, it lives where that environment is configured, and keeping it
there is exactly what makes the flip reversible on a deployment that cannot rebuild itself.

The restart is so the runtime config endpoint serves the new value. **No frontend rebuild.** The
same bundle now resolves the root to the target version because `PUBLIC_CONFIG_ENDPOINT` returns the
new `publicUiVersion` and the app reads it at first paint. If a rebuild feels necessary, re-read
rule 3 — it is not, and needing one means the value was baked.

## 5. Verify

In a browser, as a **non-administrator**:

- the canonical root (`/`, `/start`, …) serves `TARGET_VERSION`'s screens
- the URL bar carries **no** version prefix as you click through
- an existing share link that the target *does* serve still resolves (e.g. `/p/:token`), preserving
  its params

Paste what you checked. A non-admin is the right lens: an administrator is allowed on every version
and would not experience the switch the way a real user does.

---

## Rollback

```
PUBLIC_UI_VERSION=<previous version>     # in ENVIRONMENT's own configuration
```

Restart the backend. That is the whole procedure for the deployment — no rebuild, no redeploy, no
registry involvement, and it does not wait for a commit. This one-line reversibility is *why* the
value is runtime-served rather than baked, and it should be stated in the report so the operator
knows the exit exists before they confirm the change.

The repository follows separately, with `PUBLIC_VERSION_APPLY_CMD` and the previous version — a
revert of the §4a commit, or the command run backwards. Doing it in that order is deliberate: the
environment is what real users hit, and it should not wait on a pull request.

---

## Gates

- eligibility check — hard stop on any failure (§1)
- explicit human confirmation after the change report (§3), no magic word
- browser verification as a non-administrator before reporting success (§5)

---

## Outputs

- every in-repository declaration of `PUBLIC_UI_VERSION` updated, in one commit (§4a)
- `PUBLIC_UI_VERSION` set in `ENVIRONMENT`, backend restarted, no frontend rebuild (§4b)
- a verification report, and the one-line rollback stated

## Final report

1. The eligibility results — each check, pass or the stop it caused. Pasted, including the build.
   If the routing suite had no "changing `PUBLIC_UI_VERSION` changes the root" test until now, say
   so and say where the one you wrote lives.
2. The change report as presented, especially the routes that broke.
3. Confirmation that a human confirmed after reading it.
4. `PUBLIC_VERSION_APPLY_CMD`'s output, pasted — every file it wrote, old → new — or, when the
   binding is `null`, the list of files you edited by hand.
5. That `ENVIRONMENT` was set and the backend restarted with no rebuild.
6. The non-administrator browser verification — pasted.
7. The rollback line, restated.
