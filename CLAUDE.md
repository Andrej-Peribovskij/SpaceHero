# Agent Guide

Purpose: first-stop operating guide for agents working in this repository.

## Quick Scan

- Always start work on a feature branch — never edit on `main`. Naming and
  policy: @docs/delivery.md#branching.
- Use OpenSpec for changes that deliver product value.
- Use the design process for **UI versions** — a design-tool export becoming a
  running `design/vX.Y.Z`, wiring it, promoting it. Never do that work by hand:
  run the matching `/design:design-0N-*` command, which includes the wrapper in
  `design-commands/`. See "The Design Layer".
- `docs/` owns durable technical guidance.
- Backend layering is `Infrastructure -> Application -> Domain`, one project per
  layer; Domain and Application reference no framework. Cross-module access goes
  only through a module's `Contracts` project — enforced by architecture tests.
- Vendor and library concepts stay at the integration boundary, not in
  domain/app models.
- Frontend code uses canonical backend resource paths, not persona-prefixed
  routes.
- New database tables use `{module}_{table}` names, with the module prefix
  matching the owning bounded context (hyphens normalized to underscores).
- Do not edit existing migration files unless the user explicitly asks for
  migration edits; add a new forward migration for schema changes.
- Contract changes update the OpenAPI snapshot and any affected consumers.
- Meaningful changes need tests, including failure paths.
- pnpm is the package manager. Run scripts with `pnpm run <script>`, target a
  workspace with `pnpm --filter <path> ...`, and never invoke `npm` or `npx`.
  Never write `--` before a script's arguments. pnpm does not consume that
  separator, it forwards it, so `pnpm run spec:list -- --json` reaches OpenSpec
  as `openspec list "--" "--json"` and fails with `too many arguments`.
  Every script here already ends in the binary or a Node script, so pnpm has
  nothing to interpret and the separator protects nothing. Write
  `pnpm run spec:status --change <slug>`.
- Every install needs a GitHub Packages credential in a **user-level** `.npmrc`.
  A `.pnpmfile.cjs` `preResolution` hook refuses without one, before any fetch,
  and names what is wrong; a project `.npmrc` cannot carry it. Editing
  `.pnpmfile.cjs` changes `pnpm-lock.yaml` (`pnpmfileChecksum`). See
  @docs/design-system.md.
- Keep all tooling cross-platform (Windows, macOS, Linux): write repo scripts as
  Node (`scripts/*.mjs`), not shell; no bash-only constructs or inline
  `VAR=value` prefixes in package scripts; text files stay LF via
  `.gitattributes`. See @docs/delivery.md#cross-platform-tooling.
- Local stacks run on Podman (@docs/adr/ADR-0002-podman-is-the-container-engine.md).
  Call Compose through the repo scripts, never a container binary directly, and
  stay on Compose-specification surface — no `inspect`, no Go templates. See
  @docs/tooling.md.
- Add glossary and tech-debt records when new terms or accepted shortcuts
  appear.
- No new third-party dependency (npm, NuGet, pip, font, model, container base
  image, vendored source) without explicit review. Only Apache 2.0-compatible
  permissive licenses are allowed (Apache-2.0, MIT, BSD-2/3-Clause, ISC,
  Zlib, 0BSD, OFL-1.1 for fonts). Anything else — including GPL/LGPL/MPL,
  source-available (BSL, SSPL, Elastic, Commons Clause), Creative Commons
  NC/SA/ND, custom vendor EULAs, and unknown/missing licenses — must be
  surfaced as `⚠️ DANGER: license review required` and refused until legal
  approval. **One class is pre-approved and needs no review:** a package
  published by Microsoft under MIT, on the .NET platform release train this
  repository already targets (`Microsoft.Extensions.*`,
  `Microsoft.AspNetCore.*`, `Microsoft.EntityFrameworkCore.*`, `System.*`),
  carrying no native asset, no OS-specific RID and no preview suffix. All three
  conditions must hold — the `Microsoft.` prefix alone is not a licence. Full
  policy: @docs/dependencies.md.
- C# conventions that reviewers will hold you to — including one that departs
  from Microsoft's own guidance on the `Async` suffix — are under "C#
  Conventions" in @docs/backend.md. Read it before writing a method signature.
  Code style is enforced from `.editorconfig` at build and by the lint gate.

## Project Context

This is a monorepo for a full-stack web platform. **Node is the repo
orchestrator** (`pnpm run …`); each backend service is a self-contained .NET
solution under `services/*`. There are no .NET files at the repo root.

- Backend: C# / .NET 10 (ASP.NET Core, EF Core), PostgreSQL — `services/api`
- Frontend: React, TypeScript, Vite, Tailwind CSS, TanStack Query — `apps/web`
- OpenAPI snapshot: `packages/schemas/openapi/api-v1.json` — generated, the
  cross-language contract of record (never hand-edited)
- Generated TS clients: `packages/schemas`; UI primitives: the published design
  system, imported as `@space-hero/design-system` (see `docs/design-system.md`)
- Local stacks: Podman via `infra/compose/compose*.yml`, one Compose project per
  stack (`COMPOSE_COMMAND` overrides the engine)
- `Modules/Example` is the reference module: copy its shape, delete it once a
  real one exists
- `process/design`: the design → code process — seven prompts, their templates
  and the exporter. A sibling to `openspec/`, and like it, no application code

## Source Of Truth

When guidance conflicts, use this order:

1. The relevant active OpenSpec change in `openspec/changes/<slug>/`
2. Approved ADRs in `docs/adr/`
3. Baseline OpenSpec specs in `openspec/specs/`
4. Durable docs in `docs/`

A design-version run is governed by its prompt in `process/design/prompts/` for
*how*, and by `docs/design-*.md` for *what is allowed* — the prompts are held to
those docs, not the other way round.

For deeper technical guidance, start with `docs/README.md`.

## Agent Best Practices

- Prefer efficient built-in exploration tools and fast read-only commands.
  Use `Read`, `Glob`, `Grep`, `rg`, `rg --files`, `find`, and `git ls-files`
  to narrow the search space quickly.
- Batch discovery work when it speeds up exploration, but avoid approval-heavy
  Bash scripting for routine inspection.
- Avoid shell control flow such as `for`, `while`, `case`, subshells,
  command substitution, `xargs`, and `sh -c` unless the task truly requires
  them.
- Prefer direct file reads and targeted searches over formatting-heavy terminal
  output. Use `sed -n`, `head`, `tail`, `cat`, `nl -ba`, `rg`, and `git show`
  before reaching for custom shell scripting.
- For multi-file inspection, list or search candidate files first, then read
  the most relevant subset in detail instead of dumping entire file sets.
- Prefer repo-relative discovery when possible. Avoid absolute paths when the
  current workspace already scopes the task correctly.
- Before asking for approval on a read-only command, check whether the same
  result can be achieved with already-allowed commands or built-in file reads.
- When inspecting many files, summarize findings instead of printing large file
  batches unless the user explicitly asks for raw output.
- Use `rg` for text search and `rg --files` for file discovery by default; fall
  back to slower or more complex shell patterns only when necessary.
- Keep approval requests rare, specific, and justified. Do not request broad
  shell access for trivial inspection tasks.

## Feature Workflow

Use OpenSpec for work that delivers product value. Always create a feature
branch first:
`<type>/<scope>/<slug>` — never start on `main` or an unrelated branch.

When the user asks to create a new feature, change, capability, ability, or any
other new behavior that delivers product value, start with
`/opsx:propose <change-slug>` unless they explicitly ask to skip OpenSpec or
only want exploration.

Product value includes user-facing behavior, product capabilities, workflow
changes, business rules, permissions, data semantics, and anything a stakeholder
would recognize as product behavior. Purely technical maintenance does not need
OpenSpec: dependency or version bumps, formatting-only changes, build-tool
cleanup, and internal refactors that do not change product behavior can proceed
without a spec.

See `openspec/config.yaml` for workflow context and artifact rules.

In Claude Code, use the `/opsx` slash commands for product-value
propose/apply/archive workflow. These commands orchestrate the workflow; any
underlying OpenSpec CLI calls must go through the `spec:*` npm scripts.

```bash
/opsx:propose <change-slug>
/opsx:apply <change-slug>
/opsx:archive <change-slug>
```

Use repo scripts for every direct OpenSpec CLI operation:

```bash
pnpm run spec:new <change-slug>
pnpm run spec:list
pnpm run spec:status --change <change-slug>
pnpm run spec:instructions apply --change <change-slug> --json
pnpm run spec:validate <change-slug>
pnpm run spec:archive <change-slug>
```

Do not call `openspec` or `./node_modules/.bin/openspec` directly; npm resolves
the local binary for agents and humans.

Delivery conventions: see `docs/delivery.md`.

## The Design Layer

A second workflow beside OpenSpec, for UI versions rather than product value.
A designer's export becomes a mocked, administrator-only `design/vX.Y.Z`; a
technologist wires it to real backends, promotes its components into the design
system, and flips which version the public sees. The public app is never the
thing being edited.

**Do not perform any of that by hand.** Each step is a prompt with gates that
exist because skipping them is how a design iteration reaches production. Invoke
the slash command, which runs the wrapper carrying this repository's bindings:

```
/design:design-01-create           designer      export → design/vX.Y.Z
/design:design-02-wire             technologist  design version → wired prod version
/design:design-03-tech-revision    either way    a refinement, up one role
/design:design-04-preview-export   designer      preview live, export for the design tool
/design:design-05-promote-ds       technologist  staging → shipped design system
/design:design-06-promote-public   technologist  move PUBLIC_UI_VERSION
/design:design-07-clean            technologist  delete named versions, manual only
```

`/design:design-0N-*` is the standard way to run one. Each command in
`.claude/commands/design/` is a thin shim whose body only `@`-includes
`design-commands/design-0N-*.md`; the wrapper stays the single place a binding
is written, so never put a binding in a shim. The wrappers themselves stay
tool-neutral Markdown: a client without slash commands references
`@design-commands/design-0N-*.md` directly and gets the same run.
`design-commands/README.md` explains the bindings and what this repository has
to keep true; `process/design/COMMANDS.md` says which one to reach for, with
worked examples.

Four things to know before touching anything under this layer:

- **Version prefixes are never hardcoded.** Screens navigate through
  `useVersionNav`, `useVersionPath` and `<VersionLink>`. A literal
  `/v3/briefing` throws a public user onto a versioned URL, which is the one
  thing the architecture exists to hide.
- **A version folder is self-contained.** If deleting it should delete the code,
  the code lives inside it — including a wired version's own API client.
  `docs/design-folder.md` has the four invariants.
- **The design system is a separate repository**, consumed as a published
  package. Staging and promotion happen there, through prompt 05, which opens a
  pull request rather than publishing from a laptop.
- **`process/design/` and `docs/design-*.md` are the process's own text.**
  Editing a prompt changes how every future run behaves; treat it like changing
  a CI workflow, not like editing a note.

## Quality Gates

Before marking work done, run the full gate:

- `pnpm run verify` — build + lint (`dotnet format` + ESLint) + typecheck
  (`tsc --noEmit` per package) + test (unit, architecture, integration,
  frontend) + OpenAPI drift check.

`lint` and `typecheck` are two steps because `lint` is ESLint, which cannot see
a type. Running `lint` alone does not type-check the frontend — it used to,
when `apps/web`'s `lint` was `tsc --noEmit` itself.

Individual gates are also available: `pnpm run build`, `pnpm run lint`,
`pnpm run typecheck`, `pnpm run test`. `pnpm run test` also runs `test:scripts` (the guard tests for
`scripts/*.mjs`) and `test:design-process` (the design exporter's unit tests);
neither needs a database or an install. `pnpm run check:links` checks every
relative Markdown link and is what CI runs on a docs-only change.
`pnpm run test` needs no database — the database-backed backend
tests carry `[RequiresDatabaseFact]` and skip with a reason. Run
`pnpm run test:integration` (real PostgreSQL) when the change touches persistence
or a request path, and `pnpm run test:e2e` (Playwright) for a UI flow. Both need
podman running.

Do not mark a change complete until the relevant OpenSpec tasks and validation
match the implementation.

## Browser Automation (Playwright CLI)

Prefer the repo-local Playwright CLI through npm scripts instead of assuming a
global install.

```bash
pnpm run pw <command>
pnpm run pw:help
pnpm run pw:list
pnpm run pw:show
pnpm run pw:close-all
```

No `--` before the command: pnpm forwards the separator literally, so
`pnpm run pw -- list` reaches the CLI as `playwright-cli "--" "list"` and fails
with `Unknown command`.

These wrappers set `PLAYWRIGHT_CLI_SESSION=app`. If already inside an agent
session, keep using the same session name for related browser work.

## Related Docs

- `docs/architecture.md`: system scope, module map, integration philosophy
- `docs/tooling.md`: container engine, line endings, why the scripts are Node
- `docs/adr/`: the four decisions this repository's layout assumes
- `docs/backend.md`: backend implementation rules, including the **C# conventions**
- `docs/frontend.apps.md`: frontend implementation rules for the `apps` folder
- `docs/design-system.md`: consuming the published design system and the registry token it needs
- `docs/design-versioning.md`, `docs/design-version-registry.md`,
  `docs/design-folder.md`, `docs/design-staging.md`, `docs/design-testing.md`,
  `docs/design-local-components.md`: the design layer's conventions
- `process/design/README.md`: the design → code process at a glance
- `docs/testing.md`: testing policy and minimum scenarios
- `docs/delivery.md`: branching, commits, and incremental delivery
- `docs/dependencies.md`: third-party licensing policy (mandatory before any
  new package)
- `docs/glossary.md`: canonical terminology
- `docs/generated/README.md`: generated artifact rules
