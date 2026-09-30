# ADR-0005: Without a designer export, screens are built by hand in the production version

**Status:** Accepted (2026-09-30)

## Context

The design layer ([process/design/README.md](../../process/design/README.md))
assumes a designer. A design-tool export becomes a mocked,
administrator-only `design/vX.Y.Z` (prompt 01). A technologist wires it
(prompt 02) and moves `PUBLIC_UI_VERSION` to it (prompt 06). That route buys
three things:

- **A reviewed handoff.** The designer approves what is built before anyone
  wires it.
- **A private preview.** Administrators see the new version at its own prefix
  while the public sees the old one.
- **A one-line rollback.** Moving `PUBLIC_UI_VERSION` back undoes a release
  without a rebuild.

That is why CLAUDE.md says the public app is never the thing being edited.

SpaceHero has no designer. There are no design-tool exports, and none are
coming: the visuals are made in code by the people writing the game. Prompt 01
takes an export as its input (`SOURCE_PATH`). Running it anyway would mean
exporting our own code as a fake handoff, then approving it ourselves. The
ceremony would stay, but the reviewer it exists for would be gone.

The Chapter 1 intro (`openspec/changes/chapter-1-intro/`) was the first screen
to meet this. Its design put it straight into v1.0.0, and review of pull
request #8 found that this contradicts CLAUDE.md. This ADR settles which one
gives way.

## Decision

**When no design-tool export exists for a screen, the screen is built by hand,
under OpenSpec, in the current production version.** The change is
product-value work: `/opsx:propose`, specs, tasks and tests, like any other.
The screen is added to, or replaces one in, the routes of the production
version that `PUBLIC_UI_VERSION` names, in `apps/web/src/versions/registry.tsx`.

The rules that protect the public URL stay in force. The design layer is
bypassed, but the version registry is not:

- Screens reach the router only through `registry.tsx`, never `app.tsx`.
- No hardcoded version prefixes. Navigation uses `useVersionNav`,
  `useVersionPath` and `<VersionLink>`.
- The design system is consumed as `docs/frontend.apps.md` requires.
- Unit, component and E2E coverage follows `docs/testing.md`, including the
  routing E2E that proves the public URL never carries a prefix.

**The design layer resumes the day an export exists.** Its next visual
revision of a screen goes through `/design:design-01-create` as normal.
Nothing has to be reconciled first: a new design version is built from the
canonical public version (`docs/design-versioning.md`), and that version
already includes every hand-built screen.

## Consequences

Easier:

- **Screens ship through the workflow the rest of the product uses.** One
  proposal, one branch, one pull request. No synthetic export and no
  self-approval.
- **Nothing is written that a designer would throw away.** A hand-built
  screen is the canonical baseline a future design version starts from.

Harder:

- **No one-line rollback.** Undoing a hand-built screen means reverting the
  merge and deploying again, not moving `PUBLIC_UI_VERSION`. A change that
  reworks a flow users rely on, where a fast rollback matters, should say so
  in its proposal. It is then a candidate for a new version through the
  design layer, with the missing designer handoff stated openly, rather than
  an in-place edit.
- **No private preview in a deployment.** A hand-built screen is previewed on
  its branch, locally or in the pull request, rather than at an
  administrator-only prefix in a deployed environment.
- **Review carries more weight.** No designer sign-off comes before the code,
  so the pull request review is the only look the screen gets before users
  see it.
- **CLAUDE.md and the prompts describe the designer path.** CLAUDE.md points
  here from its design-layer section. The prompts in `process/design/prompts/`
  are unchanged: they still govern every run of the design layer, and this
  ADR only covers work that never enters it.
