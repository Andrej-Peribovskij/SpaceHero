---
description: Preview a -tech revision live and export it back to the design tool as a readable source tree — or export the production version that ships today (designer)
role: designer
---

<!--
  A wrapper, not a prompt. It names the prompt to follow and carries this repository's bindings,
  which is the only project-specific part of the process. Hand-written and hand-maintained: the
  generator that used to write this file detected a host's layout, and this repository's layout is
  known. Edit a binding here and it is changed.
-->

Follow the process defined in @process/design/prompts/04-preview-and-export.md

Project bindings:

- PROCESS_ROOT: process/design
  (the root of every `<process-root>/…` path a prompt names — its scripts, its templates, its
  fixtures. The process is vendored into this repository: no submodule, no package, no bootstrap.)
- APP_REPO: .
  (the application repository is this one, and the process lives inside it)
- DS_REPO: ../design-system-uds
  (a checkout of PTV-Mobility/design-system-uds beside this repository. It is deliberately NOT part
  of this tree — the design system is consumed as a published package. Only a run that stages or
  promotes a component needs the checkout at all.)
- FRONTEND_PACKAGE: apps/web
- DS_PACKAGE_NAME: "@my-app/design-system"
  (the alias apps/web imports, and prompt 04's --ds-package: the exporter recognises a
  design-system import by this name, and the package's own name is not it. apps/web/package.json
  maps it to npm:@ptv-mobility/design-system-uds — see docs/design-system.md, including the
  registry token every install needs.)
- DS_TOPOLOGY: published
- ASSETS_DIR: design-commands/assets
- DS_REPO_PATH: ../design-system-uds
  (prompt 04's --design-system: the design system's SOURCE tree, holding package.json and src/.
  Never node_modules/@my-app/design-system — that ships dist/ and structurally cannot serve it.
  Relative to this checkout; from a linked git worktree the exporter retries it against the main
  checkout. Only prompt 04 §4 runs without it, and then says what it could not include.)
- FULL_STACK_CMD: pnpm run dev
  (PostgreSQL on Podman, then the .NET API and Vite together. See docs/tooling.md.)
- FRONTEND_ONLY_CMD: pnpm --filter ./apps/web run dev
- PREVIEW_URL_BASE: http://localhost:5173
- DESIGN_PREVIEW_CMD: pnpm run design:preview
- PUBLIC_VERSION_APPLY_CMD: pnpm run public-version:set <TARGET_VERSION>
  (prompt 06 §4a. Writes every place this repository declares the public version — Public:UiVersion
  in services/api/src/Host/appsettings.Development.json, which is what `pnpm run dev`, the E2E
  suite and `pnpm run design:preview` all read, and the PUBLIC_UI_VERSION default in
  infra/compose/compose.yml, which is what `pnpm run stack:up` reads — then prints the line to
  apply in the deployment. It refuses a version with no entry in registry.tsx, which catches a
  typo and nothing more: eligibility is prompt 06 §1 and stays a person reading the registry.
  `pnpm run public-version` shows what is declared now; the guard tests fail if the two files
  ever disagree.)
- PUBLIC_VERSION_SHOW_CMD: pnpm run public-version
  (prompt 04 §4's VERSION when the designer asks for "what ships" without naming a version.
  Read-only: prints what every declaration PUBLIC_VERSION_APPLY_CMD writes says now, and whether
  they agree. A deployment's own PUBLIC_UI_VERSION is not in this repository and cannot be read
  from here.)
- PROD_SHELL_ENTRIES: []
  (prompt 04 §4: app-shell screens a user's journey passes through that are not registry routes,
  one `<route>=<file>[#Component]` per line, the file relative to FRONTEND_PACKAGE. None:
  RESERVED_ROOT_PREFIXES reserves login and register, but this app's shell renders no screen of
  its own yet — every route comes from the registry. Add a line here the day it does.)
- FIXTURES_DIR: null
  (prompt 04 §4's --fixtures root, one folder per version holding recorded API answers. null: this
  repository records none, so a production export of a wired version says it carries no mock
  data — rule 6 of the prompt.)
- FIXTURE_CAPTURE_CMD: null
  (the command that would record FIXTURES_DIR/<VERSION> from a stack running here, with
  process/design/scripts/capture-fixtures.mjs and a plan this repository writes. None yet.)
- ENV_FILE: null
  (no deployment's environment file lives in this repository. The two declarations above are what
  a clone serves; a real environment sets the flat PUBLIC_UI_VERSION where it is configured, and
  that variable outranks both. Keeping it outside is what makes prompt 06's flip reversible
  without a commit.)
- FRONTEND_GATE_CMDS (scoped to FRONTEND_PACKAGE; `null` means this repository has no separate
  script for that part — run the parts that exist):
  - lint: pnpm --filter ./apps/web run lint
  - typecheck: pnpm --filter ./apps/web run typecheck
    (apps/web's `lint` used to BE `tsc --noEmit`, which is why this was `null`. It is now
    `eslint .`, and the type check is its own script — so this entry is not optional detail:
    without it the frontend gate stops type-checking entirely)
  - test: pnpm --filter ./apps/web run test
  - build: pnpm --filter ./apps/web run build
- DS_GATE_CMDS (the design system's OWN checks — its staging export and isolation guards. A
  separate checkout, so these are unscoped and run from DS_REPO_PATH. Only reached when the
  staging set is non-empty):
  - lint: null
  - typecheck: null
    (its `build` begins with `tsc`)
  - test: pnpm run check:staging && pnpm run test
  - build: pnpm run build
  (`pnpm run check:identity` is the shipped-entry freeze proof. It runs from prepublishOnly, so a
  publish cannot skip it; prompt 05 reads its output rather than re-running it.)
- FULL_GATE_CMDS (this repository's whole gate — the fallback to widen to when the changed-path
  set reaches outside the write-set the narrow gate assumed):
  - lint: pnpm run lint
  - typecheck: pnpm run typecheck
  - test: pnpm run test
  - build: pnpm run build
  (`pnpm run verify` is all four in order plus `openapi:check`. Run it before opening a pull
  request; a design version that touches no contract still has to leave the snapshot clean.)
