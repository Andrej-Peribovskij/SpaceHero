# Design commands

The interface to the design → code process. Seven wrappers, one per prompt: each names the prompt
to follow and carries this repository's **bindings**, which are the only project-specific part of
the process. The prompts themselves are in [`process/design/prompts/`](../process/design/prompts/)
and say nothing about this repository.

These files are **tool-neutral Markdown on purpose** — plain files at a known path, not tied to
any one client. Three equivalent ways to run one:

- **In Claude Code — the standard** — the `/design:*` slash commands in
  [`.claude/commands/design/`](../.claude/commands/design/), e.g. `/design:design-01-create`.
  Each is a thin shim: it keeps a name, a description and tags, and its body only `@`-includes
  the matching wrapper here. A shim carries no binding of its own, so there is still exactly one
  place to edit one — this directory.
- **In a client that reads the repository** — reference the wrapper, e.g.
  `@design-commands/design-01-create.md`, and give the inputs in prose.
- **In any chat client** — paste the wrapper's body, then the prompt's, then the inputs.

For **which** command to reach for, who runs it, and ready-to-use example invocations, see
[`process/design/COMMANDS.md`](../process/design/COMMANDS.md).

| Wrapper | Slash command | Prompt | Run by | What it does |
|---|---|---|---|---|
| [`design-01-create.md`](design-01-create.md) | `/design:design-01-create` | 01 | designer | create a design version from a design-tool export |
| [`design-02-wire.md`](design-02-wire.md) | `/design:design-02-wire` | 02 | technologist | wire a design version to real backends as a prod version |
| [`design-03-tech-revision.md`](design-03-tech-revision.md) | `/design:design-03-tech-revision` | 03 | technologist → designer, or developer → technologist | send a refinement up one role as a `-tech` version |
| [`design-04-preview-export.md`](design-04-preview-export.md) | `/design:design-04-preview-export` | 04 | designer | preview a `-tech` revision and export a readable source tree — or export the production version that ships today |
| [`design-05-promote-ds.md`](design-05-promote-ds.md) | `/design:design-05-promote-ds` | 05 | technologist | fold staging components into the shipped design system |
| [`design-06-promote-public.md`](design-06-promote-public.md) | `/design:design-06-promote-public` | 06 | technologist | move `PUBLIC_UI_VERSION` — change what real users see |
| [`design-07-clean.md`](design-07-clean.md) | `/design:design-07-clean` | 07 | technologist | delete named design versions (manual trigger only) |

`assets/` is `ASSETS_DIR` — the committed reference images prompt 04's exporter uses for content
it cannot generate. See [`assets/README.md`](assets/README.md).

---

## The bindings, and what each one answers

Eighteen values plus three gate groups, identical in all seven wrappers. They used to be *detected*:
a bootstrap script read a host's manifests and wrote them out, because the process was a submodule
or a package and did not know where it had landed. It is vendored into one repository now, whose
layout is known, so they are literal text. **Changing one is editing a Markdown line — in all
seven files, which is the price of having no generator and is cheaper than having one.**

| Binding | This repository | What it names |
|---|---|---|
| `PROCESS_ROOT` | `process/design` | the root of every `PROCESS_ROOT/…` path a prompt names — its scripts, its templates, its fixtures |
| `APP_REPO` | `.` | the application repository, which is this one |
| `DS_REPO` | `../design-system-uds` | the design-system repository — a checkout of `PTV-Mobility/design-system-uds` beside this one, deliberately not in this tree |
| `FRONTEND_PACKAGE` | `apps/web` | the package holding `src/versions/` and `src/pages/design/` |
| `DS_PACKAGE_NAME` | `@my-app/design-system` | the design system's name as imports spell it — and prompt 04's `--ds-package`, because the exporter recognises a design-system import by it. The package's own name (`@ptv-mobility/design-system-uds`) is not what `apps/web` imports, so an export that fell back to it would find no component at all |
| `DS_TOPOLOGY` | `published` | requirement 4 below |
| `ASSETS_DIR` | `design-commands/assets` | where prompt 04's exporter finds reference images |
| `DS_REPO_PATH` | `../design-system-uds` | the tree prompt 04's exporter is handed as `--design-system`. It must hold a `package.json` and a `src/`, because the exporter resolves components **from source**; `node_modules/@my-app/design-system` ships `dist/` and structurally cannot serve it. Relative to this checkout; from a linked git worktree the exporter retries it against the main checkout. Prompt 04 §4 alone runs without it — names and tokens from the installed package, stated in its README |
| `FULL_STACK_CMD` | `pnpm run dev` | the backends **and** the frontend |
| `FRONTEND_ONLY_CMD` | `pnpm --filter ./apps/web run dev` | the frontend dev server alone |
| `PREVIEW_URL_BASE` | `http://localhost:5173` | where the app answers |
| `DESIGN_PREVIEW_CMD` | `pnpm run design:preview` | requirement 6 below — the frontend plus a synthetic administrator, with no auth backend |
| `PUBLIC_VERSION_APPLY_CMD` | `pnpm run public-version:set <TARGET_VERSION>` | prompt 06 §4a. Writes **every** place this repository declares the public version, so promoting one is not two hand-edits in two syntaxes that can disagree. It cannot touch a deployment and does not try — see requirement 3 |
| `PUBLIC_VERSION_SHOW_CMD` | `pnpm run public-version` | prompt 04 §4's version when none is named: what this repository declares public, read-only. Never `PROD_VERSIONS[0]`, which is the fail-safe rather than the public version |
| `PROD_SHELL_ENTRIES` | `[]` | prompt 04 §4: the app-shell screens a journey passes through that are not registry routes, as `<route>=<file>[#Component]`. Empty: `login` and `register` are reserved roots, but the shell renders no screen of its own yet. **Declared, never discovered** — walking `app.tsx` would pull in every version through the registry |
| `FIXTURES_DIR` | `null` | prompt 04 §4: recorded API answers per version, the production export's mock data. `null` means the export of a wired version says, in its README, that it carries none — never that a mock was written for it |
| `FIXTURE_CAPTURE_CMD` | `null` | prompt 04 §4: how `FIXTURES_DIR/<VERSION>` would be (re)recorded from a local stack — [`capture-fixtures.mjs`](../process/design/scripts/capture-fixtures.mjs) with a plan this repository writes, then [`curate-fixtures.mjs`](../process/design/scripts/curate-fixtures.mjs) with its declared edits. Nothing to record yet |
| `ENV_FILE` | `null` | no deployment's environment file is in this repository. A real environment sets the flat `PUBLIC_UI_VERSION` where it is configured, and that is deliberate: it is what lets a promotion be reversed without a commit |
| `FRONTEND_GATE_CMDS` | lint / typecheck / test / build, `--filter ./apps/web` | the gate **scoped to `FRONTEND_PACKAGE`**. All four are real scripts |
| `DS_GATE_CMDS` | `check:staging`, `test`, `build`, run from `DS_REPO_PATH` | the design system's **own** checks, read off its manifest rather than this one's. Only reached when a version actually stages something |
| `FULL_GATE_CMDS` | `pnpm run lint` / `typecheck` / `test` / `build` | the whole gate at the repository root — the fallback to widen to |

**Each gate binding is four command strings, not one, and any of them may be `null`.** `null` says
"no separate command for that part", and a run does the parts that exist. `DS_GATE_CMDS` still
uses it twice: the design system has no ESLint and no standalone type check, because its `build`
begins with `tsc`.

Both of this repository's own bindings name all four. That is new. Until ESLint was added,
`apps/web`'s `lint` **was** `tsc -p tsconfig.json --noEmit`, so `typecheck` was `null` — a second
entry would have asserted a script that did not exist and compiled twice to do it. `lint` is now
`eslint .`, which cannot see a type, so `typecheck` is a script of its own in every package that
has TypeScript, and `pnpm run typecheck` runs them. **A binding that still says `typecheck: null`
for `apps/web` is now a gate that does not type-check** — the most expensive kind of stale
binding, because it goes on reporting green.

**All four `null` is a stop, not a pass.** A run that executes nothing and reports green is
strictly worse than no gate, because it wears the safe branch's colours. Prompt 01 §9.2 stops on
it for each of the three gate bindings. In this repository that can now only happen by
mis-transcribing a binding, not by the repository's own shape: `FRONTEND_GATE_CMDS` and
`FULL_GATE_CMDS` each name four commands that exist, and `DS_GATE_CMDS` names two.

---

## What this repository must keep true

The process rests on six things. Five are required; the sixth is optional and nothing breaks
without it. A bootstrap script used to check these on every run and report what was missing —
there is no bootstrap now, so this table is the check, and a prompt that finds one of them absent
reports it against the line here.

| # | Requirement | State today |
|---|---|---|
| 1 | **A version registry** at `apps/web/src/versions/` — the version table, the rules for reading it, the public-version resolver, prefix-free navigation, the router mount and a contract test | **met.** Written from [`process/design/templates/version-registry/`](../process/design/templates/version-registry/) against the contract in [`docs/design-version-registry.md`](../docs/design-version-registry.md). `v1.0.0` is a real registered version serving the app's own screen, not a seeded placeholder, and `useVersionRoutes` is wired into `apps/web/src/app.tsx` |
| 2 | **An administrator flag** the frontend can read from the authenticated user. The access gate needs nothing more sophisticated | **met.** `GET /api/v1/me` over the existing `IActorContext`, read through `apps/web/src/infra/auth/use-is-administrator.ts` |
| 3 | **A runtime config endpoint** — `GET /api/v1/public-config`, reading environment fresh **per request**, returning `publicUiVersion` | **met.** The endpoint reads fresh per request, and the value is now set on both paths the API actually reads configuration from: `Public:UiVersion` in [`services/api/src/Host/appsettings.Development.json`](../services/api/src/Host/appsettings.Development.json) for `pnpm run dev`, and `PUBLIC_UI_VERSION` on the api service in [`infra/compose/compose.yml`](../infra/compose/compose.yml) for the container path, overridable from the environment. The flat variable outranks the section, which is the precedence prompt 06's flip relies on — an operator moving the public version must not be outranked by a committed settings file. It must stay runtime, not build-time: a deployment that cannot reach the package registry cannot rebuild itself, so a value baked into the bundle can never be changed in place. Never add a build-time variable beside it — a frontend with two answers to "which version is public" gets the wrong one on the day it matters. Both declarations are written by `pnpm run public-version:set`, bound as `PUBLIC_VERSION_APPLY_CMD`, and a guard test fails if they disagree. Before that, promotion meant finding two files by hand in two syntaxes, and prompt 06 named neither |
| 4 | **A design system consumed as a published package** (`^x.y.z` from a registry), never `file:`, `link:`, `workspace:` or `portal:` — the staging mechanism depends on subpath exports from a published artifact | **met.** `@my-app/design-system` is `npm:@ptv-mobility/design-system-uds@^0.6.1`. See [`docs/design-system.md`](../docs/design-system.md) |
| 5 | **A branch policy blocking direct pushes to `main`.** The magic-word gate in prompt 01 is a convention and cannot technically stop a push; the branch policy is the real backstop | **not enforced.** Branch protection is unavailable on a private repository under this plan — [`docs/tech-debt/no-branch-protection-on-main.md`](../docs/tech-debt/no-branch-protection-on-main.md) |
| 6 | **A design-preview session** — a development-only way to hold an administrator session without the auth backend, so a `wired: false` version can be reviewed against the frontend alone. **Optional** | **met.** `pnpm run design:preview` ([`scripts/design-preview.mjs`](../scripts/design-preview.mjs)) serves `GET /api/v1/me` as an administrator and `GET /api/v1/public-config` as the dev API would, then starts the frontend dev server pointed at it. No application code: the frontend already reads where its API is from `/config.json` at runtime, so the seam is one environment variable and a stub. It is now load-bearing beyond prompt 04 as well — the routing suite's administrator tests run against it, because a browser cannot otherwise hold an administrator session here |

### On requirement 6, and what it cost

The seam is the difference between *a designer needs Node* and *a designer needs the whole
product* — here: Podman, PostgreSQL, the .NET SDK, migrations and the environment file, before
a single screen is ported. None of that can affect a version whose data is mocked by
construction.

**Neither shape this section used to propose is what was built, because both assumed a store**
**that does not exist.** The preferred shape was a script seeding a synthetic session into
whatever store the app reads a session from; the fallback was a dev-only flag in the session
hook. This app holds no session client-side at all — `apps/web/src/infra/http/client.ts`
attaches no token, and the session *is* the answer to `GET /api/v1/me`. So the seam sits one
level out: a stub that answers the two deployment endpoints, with the frontend pointed at it
through the runtime config it already reads from `/config.json`.

That keeps the property the preferred shape was preferred for, and strengthens it. There is no
application code in the seam, nothing conditional in the bundle, and nothing that could reach
production: `scripts/design-preview.mjs` is the whole of it, and deleting the file removes the
feature completely.

**The honesty clause, and how it is enforced.** A preview runs without the backend *because the
version is mocked*, not because previews are cheap. The moment a version reads a real endpoint
it is `wired: true` and belongs to prompt 02 or 03, and the full stack comes back with it. The
stub answers every path other than those two with `501` and says exactly that, so a wired
version fails with the reason rather than rendering an empty screen — the clause is a tested
behaviour rather than a paragraph.

It listens on `127.0.0.1:3200` — loopback only, because it grants an administrator capability
to anyone who asks; not `3000`, which is the dev API's, and not `3100`, which the E2E suite
starts its own API on.
`DESIGN_PREVIEW_API_PORT` moves it.

---

## Checklist

What a prompt reports against when it finds something missing.

```
[x] Version registry present at apps/web/src/versions/ and committed
[x] A real version registered — v1.0.0 serves the app's own screen
[x] useVersionRoutes wired into the app router
[x] Administrator flag readable from the authenticated user
[x] Runtime config endpoint serves publicUiVersion, read fresh per request
[x] PUBLIC_UI_VERSION set where the API reads configuration — Public:UiVersion in
    appsettings.Development.json for the dev host, PUBLIC_UI_VERSION on the api service in
    compose.yml for the container path
[x] Both of those written by one command — pnpm run public-version:set <version>, bound as
    PUBLIC_VERSION_APPLY_CMD, with a guard test that fails if they ever disagree. Two hand-edits
    in two syntaxes is how one moves and the other does not
[x] Design system consumed as a published registry package
[x] Design-system staging entry and subpath exports configured
[x] Assets dir present with a registry.json (commit as reference images are added)
[x] FRONTEND_GATE_CMDS scoped to apps/web, and a full-gate fallback named
[x] DS_GATE_CMDS names the design system's own checks — at least its build, which is where the
    staging export and isolation guards run
[x] DS_REPO_PATH points at the design system's SOURCE tree (package.json + src/), not node_modules
[x] Prompt 04 §4's bindings stated rather than guessed — PUBLIC_VERSION_SHOW_CMD names the
    read-only public-version command; PROD_SHELL_ENTRIES is empty and FIXTURES_DIR null on purpose,
    so a production export says it has no shell screens and no mock data instead of inventing either
[x] FULL_STACK_CMD and PREVIEW_URL_BASE written down — neither is detectable, and both are
    guessed on every run until they are
[x] DESIGN_PREVIEW_CMD set — pnpm run design:preview, a stub session plus the frontend dev
    server, with no application code in the seam
[x] Version prefixes not hardcoded inside pages/**  —  enforced. eslint.config.mjs at the root
    bans string and template literals matching ^/v\d or ^/design/ inside apps/web/src/pages/**,
    and apps/web's lint is that ESLint run. The rule sees literals only: a prefix assembled at
    runtime from a variable passes it, which is what the routing E2E below is for and why the
    two lines are not the same box
[ ] Branch policy blocks direct pushes to the default branch
    — docs/tech-debt/no-branch-protection-on-main.md
[x] Routing suite present and green  —  two layers. apps/web/src/versions/routing.test.tsx
    covers the contract in jsdom; tests/e2e/flows/routing.spec.ts and
    tests/e2e/design-preview/ are the Playwright suite docs/design-testing.md §1 asks for, and
    are the only thing that sees navigation composed at runtime in a real address bar
```

`[~]` is "partly, and the gap is named". No line carries it any more: the prefix rule arrived
with ESLint and the routing suite with the Playwright projects. They stay two lines rather than
one for the reason they were both `[~]` for — a rule over literals and a suite that walks routes
catch different halves of the same mistake, and neither is a substitute for the other.

The one unticked line is the branch policy, and it is not this repository's to tick: see
[`docs/tech-debt/github-free-plan-limits.md`](../docs/tech-debt/github-free-plan-limits.md).
