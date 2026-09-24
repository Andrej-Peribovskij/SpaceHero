# Testing

Three risks are worth automating against, and one commonly-proposed test is deliberately not
written. The reasoning matters more than the list, because the temptation to add app-level visual
regression recurs.

| Risk | Covered by | When |
|---|---|---|
| The version prefix leaks into a public user's URL | routing E2E (Playwright) | every commit |
| A staging publish breaks the public app | build-artifact diff of the shipped entry | every DS publish |
| Promotion visually drifts shipped components | Storybook snapshots (Playwright) | promotion only |
| A design version matches designer intent | **the human test gate** | prompt 01, before any push |

---

## 1. Routing E2E — every commit

The acceptance criterion for the dual-mount architecture. Four tests, all written:

1. A non-administrator walks the public flow; the URL never matches `/v\d|/design/`
2. `/v1.0.0` redirects a non-administrator to `/`, keeping the query string
3. `/design/v4.0.0/…` redirects a non-administrator to the canonical root
4. An administrator reaches both the canonical and the prefixed mount

Tests 1–3 are in [`tests/e2e/flows/routing.spec.ts`](../tests/e2e/flows/routing.spec.ts), against
the ordinary stack, where the browser is anonymous because
`apps/web/src/infra/http/client.ts` attaches no token. Test 4 is in
[`tests/e2e/design-preview/`](../tests/e2e/design-preview/), a second Playwright project whose web
server is `pnpm run design:preview` — the seam from requirement 6, which answers `/api/v1/me` as a
synthetic administrator and 501s everything else. There is no login flow to drive and no token a
browser could mint, so that seam is the only way to *be* an administrator here.

Test 1 is the one that earns its keep. The ESLint rule bans hardcoded prefix *literals*, but
navigation composed at runtime — a path assembled from a variable, a redirect read from storage —
is invisible to static analysis. Only a browser catches it. It is written as a link walk rather
than a single `goto`, so that it covers pages prompt 01 has not created yet without being edited.

Tests 2 and 4 are the pair that proves the administrator gate: the same URL, the same build, a
different session, the opposite outcome. Neither on its own proves anything about it.

### Two tests this list used to have

**A share link `/vX/p/:token`, resolving for a non-administrator reviewer.** Dropped: this
product has no share links. The route was never in the template, and a test written against an
invented one proves that the invention works. `RequireAdministrator` still carries the rule share
links need — a non-administrator on a version prefix keeps the subpath rather than being dumped at
the root, which is what test 2's query-string assertion exercises — so the behaviour is covered
even though the surface is not. Put this test back with the first real share route.

**Changing `PUBLIC_UI_VERSION` changes which version answers at the root.** Dropped for now: one
production version is registered, so there is nothing to switch between and the test would assert
that `v1.0.0` still answers after being told to serve `v1.0.0`. It is not tech debt in the
meantime; it is a test of a thing that does not exist.

This is the one line of §1 that comes back by itself, and there is a named moment for it. Prompt
02 registers the second production version, which is when the test becomes writable. Prompt 06 is
when it is first *needed* — its eligibility check requires the suite to have run with the target
answering at the root, and says in as many words that a host which never had a second version
writes this test as part of that promotion rather than filing it as a follow-up. The first switch
is exactly the one nothing has ever covered.

---

## 2. Shipped-entry build diff — every DS publish

Build the shipped entry at the previous published version and at the candidate, and diff the
output. A non-empty diff fails the publish.

This is stronger and cheaper than screenshotting the app to prove a staging publish was safe: it
proves the shipped artifact is *identical*, rather than proving a handful of screens happen to
look the same.

---

## 3. Storybook snapshots — promotion only

Playwright screenshots of the shipped Storybook stories, baselines committed to the design-system
repo, compared before and after a promotion.

Scoped tightly on purpose:

- **Storybook, not the app.** Components in isolation have stable baselines. Application screens
  do not.
- **Promotion only, not every commit.** Promotion is the only moment shipped components change.
  Running per-commit would produce noise during staging work, which is *supposed* to look
  different.

The props diff in prompt 05 catches API breaks; these snapshots catch what it cannot see — a
staged component with two pixels more padding than the shipped one it replaces.

### Playwright, not Chromatic

Local screenshots committed as baselines. Chromatic is paid SaaS and uploads UI to a third party,
a poor fit alongside an on-prem registry. The unused `@chromatic-com/storybook` devDependency is
removed.

---

## What is deliberately not tested

### App-level visual regression of design versions

Not written, and should not be added.

A design version is *new by definition* — there is no baseline to diff against. It runs on mock
data, and it is expected to look different from every other version. A snapshot suite over
`design/**` produces a wall of intentional diffs, which trains everyone to approve diffs without
reading them, which is worse than having no suite at all.

The check that a design version looks right is the **human test gate** in prompt 01: the designer
runs it in a browser and types `APPROVE vX.Y.Z`. That is not a weaker substitute for automation.
It is the correct instrument, because the question — *does this match my intent* — has no
machine-readable answer.

### The exporter

`export-design-version.mjs` copies files. It has no Playwright dependency and takes no
screenshots: the design tool reads code and rebuilds screens from it, so rendered images add
weight and a browser dependency to every export for no benefit.

Both of its modes are tested end to end without an install: the tests build a synthetic frontend
and design system in a temp directory, run the export, and read the written zip back. The
production mode (prompt 04 §4) has one more, run against this repository's own `apps/web`, which
skips when neither a design-system source tree nor an installed package is present — an absence
on a CI runner with no install is not a defect.

The fixture runners behind a production export's mock data are tested the same way.
`capture-fixtures.mjs` is exercised against a real HTTP server on loopback, so "it sends nothing
but GET" and "it refuses a non-loopback address" are asserted on what went over the wire.
`curate-fixtures.mjs` is tested on each clause of its contract — a changed figure, a
non-idempotent edit and an edit that names no artefact are all refused, and nothing is written.
A second run is checked against the capture's record of numbers, not the curated files, so it
stays strict, and a figure changed by hand after curation is caught.
