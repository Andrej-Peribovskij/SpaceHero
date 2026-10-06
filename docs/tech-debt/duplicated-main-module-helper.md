# Duplicated main-module helper

**Created:** 2026-10-06
**Module:** tooling (`scripts/lib/`, `process/design/scripts/`)

## What

`isMainModule` exists twice: `scripts/lib/main-module.mjs` for the repository's
scripts, and `process/design/scripts/main-module.mjs` for the design exporter
and the fixture scripts. A test in `process/design/scripts/main-module.test.mjs`
fails when the two function bodies differ, so a change to one has to be made to
both.

## Why

`process/design/` imports nothing from outside itself, so that the process can
be read, run and moved as a unit, like `openspec/`. Importing the helper from
`scripts/lib/` would break that for one small function. A short copy and a
drift test cost less than the coupling.

## Resolution

Retire one copy when either changes:

- `process/design/` stops being self-contained, and its scripts import from
  `scripts/lib/`; or
- every Node version this repository runs on, including the runner's default
  Node in CI, supports `import.meta.main`, and both helpers give way to it.

Either is a small, mechanical change: replace the import in three design
scripts and five repository scripts, then delete the helper and its test.
