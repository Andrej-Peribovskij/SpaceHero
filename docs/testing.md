# Testing Guide

Purpose: define the durable testing strategy and minimum coverage expectations
for the repo.

## Quick Scan

- Test behavior, not implementation details.
- Keep tests deterministic and focused, close to the code they verify (backend
  tests in `services/api/tests/*`, frontend tests beside the feature).
- Add a regression test for every bug fix.
- Prefer unit and integration coverage; keep automated E2E minimal but present
  for major flows.
- Major flows require both integration and E2E coverage.
- Contract changes update backend and frontend tests in the same change.
- Run `build`, `lint`, and `test` before marking work done.
- The design layer has three risks of its own, and one commonly-proposed test
  it deliberately does not write: `design-testing.md`.
- The repo scripts have tests too (`pnpm run test:scripts`, part of `test`).
  They cover the *guards* — the conditions under which a script declines to
  act — because those are what break an install or a pipeline.

## Core Principles

- Use the smallest setup that proves the behavior.
- Avoid hidden global state and brittle test architecture.
- Keep fixtures explicit and scenario-specific.

### Where tests live differs by stack

- **Frontend (`apps/*`, `packages/*`)**: tests sit next to the code they verify.
  Vitest collects them wherever they are.
- **.NET (`services/api`)**: tests sit in **separate test projects** under
  `services/api/tests/`, never beside the code. A test project is an assembly, so
  a test inside `src/` would ship xUnit into the production image and give
  `Domain` a test-framework reference the architecture tests exist to forbid.

  It is also a build constraint. Test discovery is `dotnet test api.slnx`
  (`scripts/backend.mjs`), driven entirely by the solution file — there is no
  naming glob, and the existing projects (`tests/Unit`, `tests/Architecture`,
  `tests/Integration`) do not follow one. So **a new test project must be added
  to `api.slnx`**. One that is left out still compiles through a transitive
  `ProjectReference` while running nowhere, which is a green build that verified
  nothing.

This section replaces a rule that said "do not move tests to a top-level
`tests/` directory unless an ADR explicitly approves it". That is a JavaScript
convention, it contradicted the Backend Expectations directly below it, and
following it on the .NET side produces exactly the green-build-that-tested-nothing
described above.

## Backend Expectations

Backend tests live in `services/api/tests/{Unit,Architecture,Integration}` and
use xUnit. They run via `pnpm run backend:test` (or `pnpm run test`).

- **Unit** — domain entities and value objects with invariants or lifecycle
  behavior, and use cases with branching, error handling, or orchestration. Use
  lightweight test doubles at Application ports (see `tests/Unit/TestDoubles.cs`).
  Pure delegation use cases may omit unit tests.
- **Architecture** — assert the layering with a test: Domain, Application, and
  Contracts reference no ASP.NET Core, EF Core, or Npgsql. Boundaries are proven,
  not just documented.
- **Integration** — host the app in-process with `WebApplicationFactory<Program>`.
  Paths that do not touch the database (liveness, the contract document, the auth
  boundary) run in the default suite. Data-backed paths carry
  `[RequiresDatabaseFact]`: they skip with a reason under `pnpm run test` and run
  against a real PostgreSQL under `pnpm run test:integration`. Never let one fail
  silently for want of a connection.
- Validate cross-module flows through a module's `Contracts` surface, not its
  internals.

Minimum scenarios for new or changed endpoints:

- happy path
- input validation failure
- missing authentication and missing capability
- cross-scope denial when the resource is owner-scoped
- not-found or conflict when relevant
- error mapping (app-owned code → Problem Details) for expected failures

## Frontend Expectations

- Use `Vitest`, React Testing Library, `@testing-library/user-event`, and MSW.
- Test user-visible behavior, not component internals.
- Prefer view-level integration tests over isolated component tests.
- Cover loading, success, error, and empty states when relevant.
- Keep frontend tests close to the feature code.
- For route regressions, use endpoint-specific MSW handlers so incorrect paths
  fail fast.

Minimum scenarios for new or changed UI flows:

- render or entry state
- primary user interaction
- failure state when relevant
- empty state when relevant

## Contract and Integration Coverage

- Keep OpenAPI aligned with the implementation.
- If an API response shape changes, update backend and frontend tests in the
  same change.
- Repository and endpoint integration tests run against real PostgreSQL
  (`pnpm run test:integration`) with isolated data.
- Reset DB state between integration tests.

## Major Flow Coverage

A "major flow" is a multi-step user journey that crosses module or service
boundaries.

Major flows must have:

- **Integration tests** — backend tests (`WebApplicationFactory` + real DB) that
  exercise the full request chain for the flow's endpoints.
- **E2E tests** — Playwright tests in `tests/e2e/flows/` that walk through the
  flow as an authenticated user.

## Local Quality Gate

- `pnpm run verify` — build + lint + test + OpenAPI drift (the full gate).
- Container-backed suites (need podman): `pnpm run test:integration` (real
  PostgreSQL on 5433) and `pnpm run test:e2e` (Playwright, its own database on
  5434 plus an API on 3100 and a web server on 5273). Install the browser once
  with `pnpm exec playwright install chromium`.

Existing tests should remain green before work is considered done.
