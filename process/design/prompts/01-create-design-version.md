# 01 — Create a design version

**Run by** the designer.
**Supersedes** `integrate-new-frontend-version.auto-publish.prompt.md` and its `branch-only`
variant, merged into this one prompt with a publish mode (see Inputs).

Turn a design-tool export into a running `design/vX.Y.Z` inside the application, plus the
design-system staging area it needs. The version is **mocked**, **administrator-only**, and
**cannot affect the public app**. Nothing leaves the machine until the designer types the magic
word.

---

## Bindings

The command wrapper that invoked this prompt carries a bindings block. Read it before anything
else. Every path and **every command** below comes from it: never substitute a literal — not a
package-manager invocation, not a package filter, not a directory name. `design-commands/README.md`'s section
*The bindings, and what each one answers* is the authority on what each name means; read it rather
than guessing from the table here.

| Binding | What this prompt does with it |
|---|---|
| `PROCESS_ROOT` | where this process is installed — the root of every `PROCESS_ROOT/…` path below, including the PR template in §12. Read it from the wrapper rather than assuming; the conventions in §1 are **outside** it, in `docs/` |
| `APP_REPO` | the application repository — §3, §6, §7, §8, §9, §10 |
| `DS_REPO` | the design-system repository — §4, §5, §10. May be the *same tree* as `APP_REPO` when `DS_TOPOLOGY` is `workspace`; rule 3 still holds, because it is about commits, not directories |
| `FRONTEND_PACKAGE` | the package holding `src/versions/` and `src/pages/design/` |
| `DS_PACKAGE_NAME` | the design system's package name, as imports spell it |
| `FRONTEND_ONLY_CMD` | the frontend dev server alone. This prompt **never selects it directly**: it is the thing a `DESIGN_PREVIEW_CMD` implementation wraps — seed a session, then start the frontend — not a standalone way to preview a design version. See rule 7 |
| `DESIGN_PREVIEW_CMD` | the design-preview seam (`design-commands/README.md` requirement 6): the frontend **plus an administrator session**, with no auth backend. **It may be empty** — that is the host stating it has no seam, not a detection failure |
| `FULL_STACK_CMD` | backends **and** frontend. Needed for a `wired: true` version, and for **every** version on a host that declares no seam — see rule 7 |
| `PREVIEW_URL_BASE` | where the app answers once one of the three above is up |
| `FRONTEND_GATE_CMDS` | lint / typecheck / test / build, **scoped to `FRONTEND_PACKAGE`** — §9's gate |
| `DS_GATE_CMDS` | the same four in the design-system repo — §9.2's second half, run **only** when §4.2's staging set is non-empty. This is where the staging export and isolation guards live |
| `FULL_GATE_CMDS` | the same four at the host root — the fallback §9 widens to when the changed-path set escapes the declared write-set |

**All three gate bindings are four command strings, not one, and any part may be `null`.** A `null` is
information, not a gap: it is the host saying *there is no separate script for that part here*.
`@tempo/web` has no `typecheck` because its `lint` **is** `tsc --noEmit`, and a binding that copied
the lint command under `typecheck` would make the host assert a script it does not have and compile
twice to do it. So:

- **all four named** — run all four;
- **some named, some null** — run the named ones *only*. **Never synthesize a command for a null
  part**, and never widen the scope to manufacture one;
- **all four null** — the host has named no gate at all. This is reachable, not theoretical, and
  §9 says what to do about it, because a run that treats it as "nothing to run, therefore pass" is
  worse than no gate at all.

## Inputs

| Input | Notes |
|---|---|
| `SOURCE_PATH` | absolute path to the design-tool export ("Handoff to Claude Code" output) |
| `SUMMARY` | 1–3 sentences: what the version is, its screens and its flow |
| `DESIGN_NOTES` | optional: new or changed UI patterns to reflect in the design system |
| `--publish-on-approve` | **the default, and what you get when no mode is given.** Staging is built and verified locally; the registry publish happens in §12, with the push. Read §5.5: it changes what can be verified while the designer iterates |
| `--publish` | publish to the registry at §5.3, mid-run. Today's old behaviour, now opt-in. Use it only when you need the registry round-trip proven before porting — and know that it is a permanent write to a shared registry, made before the designer has seen anything |
| `--no-publish` | never publish, in this run or on approval. Offline work; a networked machine publishes and repins later. Read §5.5 — it costs the same verifications as the default, and keeps costing them after approval |

The three are mutually exclusive. If more than one is given, stop and ask which was meant; do not
pick.

If `SOURCE_PATH` is missing or does not exist, stop and ask. Do not invent an export.

---

## The rules that do not bend

Read these before writing anything. Each one exists because a previous run got it wrong.

1. **The shipped design system is frozen.** For the whole of this run, `DS_REPO/src/components/`,
   `src/index.ts`, `src/index.css` and `src/lib/` do not change — not one line, not "just an
   extra prop", not a new icon. Everything new or changed goes into `src/staging/vX.Y.Z/`. This
   is what lets the publish be safe by construction: the shipped entry's build output stays
   byte-identical, so the public app can reinstall with a proof rather than a hope.
2. **Never `file:`, `link:`, `workspace:` or `portal:`** for the design system. Not even
   temporarily, not even to check something locally. The app consumes it only as a published
   package from the registry, `"DS_PACKAGE_NAME": "^x.y.z"`. There is no local-link fallback, and
   a committed state that only builds with one is a broken commit.
3. **Two repos, two branches, two commits.** Never cross-commit. Never stage a file from one repo
   while committing in the other.
4. **`App.tsx` (or the host's router file) does not change.** A version is an appended row in
   `src/versions/registry.tsx`. If you find yourself editing the router, stop — the registry is
   not doing its job and that is a bug to report, not to work around.
5. **The magic word gate.** Nothing is pushed, **published to the package registry**, published to
   a branch, or PR'd until the designer replies with exactly `APPROVE vX.Y.Z`, including the
   version. "looks good", "ok", "ship it", a thumbs-up — none of these are the magic word. See §11.

   The registry publish is named here deliberately. It used to sit at step 5 of 12, and a rule that
   promises "no remote act before the magic word" while the prompt performs the most permanent
   remote act available — a version of a package every other project reads, which cannot be
   unpublished — is a rule the prompt itself broke. `--publish-on-approve` (Inputs, §5.3, §12) is
   what makes rule 5 true rather than aspirational. `--publish` still exists, and choosing it is
   choosing to break this rule knowingly, for a stated reason, in the report.
6. **Never ask the designer a technical question.** A designer owns the design language, not the
   stack. They cannot and must not be asked which TypeScript/JavaScript library to depend on, which
   version of it, whether a package or an environment resource is "available", what architecture to
   adopt, or any other implementation choice. Every such doubt is resolved **by study, not by
   asking** — see §1.1. The designer answers exactly one kind of question: which increment (§2),
   plus the two design-content flags this prompt already names (a cross-version link that was not
   part of the design, §7.1; an icon *concept* the registry lacks, §4.3). Nothing else. If you find
   yourself about to ask a designer anything with a library name, a version number, a config key or
   an architecture term in it, stop — the answer is already in the codebase, and §1.1 tells you
   where to look.

   The paradigmatic mistake: an export used `mapbox-gl`, and a run asked the designer whether the
   `VITE_MAPBOX_TOKEN` resource was "granted". It is not a designer's question, and it did not need
   asking — the canonical public version already depends on `mapbox-gl` and the token is already
   configured in the app's environment (`.env` carries `VITE_MAPBOX_TOKEN`). The dependency
   and its resource are, by rule 6 of this list, **assumed present and reused**. See §1.1.
7. **A version is previewed on whatever runtime its registry entry requires. Read the `wired` field;
   do not assume.** The runtime is a property of the version, not a blanket rule of this prompt.

   - **`wired: false`** — every version this prompt creates (§7.3, §8) — **is previewed with
     `DESIGN_PREVIEW_CMD` when the host sets one, and with `FULL_STACK_CMD` when it does not.**
     Its data is mocked and colocated by construction, so no backend has anything to serve it —
     but that is only half of what a preview needs. The other half is an administrator session,
     and `DESIGN_PREVIEW_CMD` is exactly the host's way of supplying one without an auth backend.
   - **`wired: true`** — a `-tech` revision from prompt 03, or a version handed to prompt 02 —
     talks to real backends and **needs the full stack**, `FULL_STACK_CMD`, every time.

   **`FRONTEND_ONLY_CMD` is not the fallback, and this is the trap.** Booting the frontend and
   *reaching* the design version are two different things, and only the first is free. `/design/*`
   is administrator-only: the server starts, the app renders, and the designer is redirected to the
   public version because nothing is holding an administrator session. `FRONTEND_ONLY_CMD` is what
   a seam *wraps*; it is not a seam. A host that has not built one says so by leaving
   `DESIGN_PREVIEW_CMD` empty, and `design-commands/README.md` requirement 6 states the consequence plainly:
   its designers run `FULL_STACK_CMD` exactly as today, and nothing breaks without it.

   **The honesty clause, which is the whole of this rule:** the preview runs without the backend
   *because the version is mocked* **and** because the host supplied a seam — not because previews
   are cheap. Both halves are load-bearing. A host with no seam pays full price, and that is the
   documented, supported state rather than a failure to work around. And the moment a version reads
   a real endpoint it is `wired: true` and prompt 02's or 03's territory, and the full stack comes
   back with it. This is not a cheap way to preview wired work.

   **This rule used to say the opposite, and the correction is worth carrying.** It claimed the
   frontend alone renders an "internal server error" for `/design/*`, because the route is
   administrator-only and the app must call the backend to establish the session. That was read out
   of one host and generalized, and it is false wherever the host's runtime-config fetch falls back
   — which is what `design-commands/README.md` requirement 3 and the version registry are written to
   do. Measured on the reference implementation, 2026-09-16, with the frontend dev server and
   nothing else running: all six routes of the design version rendered, the app attempted exactly
   **one** backend call in the entire walk (`GET /api/v1/public-config`), the fallback chain caught
   it and narrated itself in three console lines, and there was no error boundary, no React error
   and no failed chunk.

   **Read that measurement precisely, because it proves the narrower thing.** Those routes rendered
   only because an administrator session had been seeded into the browser's local storage by hand
   first; demoting the same session to a non-administrator role redirected the design route straight
   to `/`. So it is evidence that **a session-seeding seam suffices** — the claim host requirement 6
   makes — and *not* evidence that the frontend server alone suffices. The one thing genuinely
   missing without a backend was the session, and supplying it is what the seam is for.

   A host whose frontend genuinely **hard-fails** with its API unreachable is a real shape, and
   that host declares it by leaving `DESIGN_PREVIEW_CMD` empty; its designers run `FULL_STACK_CMD`
   exactly as before. What is not allowed is either blanket claim — that the backend is always
   needed, or that it never is. Read the binding, read `wired`, and say in the report which runtime
   you used and why.

---

## 1. Orient

Read before touching anything. Report a two-line summary of each so it is clear you did.

- `FRONTEND_PACKAGE/src/versions/registry.tsx` — the version table, the entry shape, the
  `INCLUDE_DESIGN_VERSIONS` branch.
- `docs/design-folder.md` — the four invariants.
- `docs/design-staging.md` — the staging layout and the build rules.
- `docs/design-versioning.md` — what X, Y and Z mean.
  Those three are repository paths, not `PROCESS_ROOT/…` paths: the conventions live in `docs/`
  with the rest of this repository's durable guidance, deliberately not in a second copy under
  the process folder.
- An existing design version's folder, as the shape to copy.
- `docs/architecture.md` and `docs/frontend.apps.md` — how this repository is put together.

Then inventory what exists: the current design versions in registry order, the screens each one
has, and the naming conventions the codebase already uses. You are adding to a system, not
starting one.

### 1.1 Study the canonical version — this is where technical doubts are resolved, not by asking

Rule 6 forbids putting a technical question to the designer. This step is how you keep that rule:
**every implementation choice is answered by studying what the app already is**, before you write a
line and before you consider raising anything with the designer.

The reference point is the **canonical public frontend version** — the one served unprefixed at
`/`, named by `PUBLIC_UI_VERSION` in the app's environment (`v4` in the reference implementation;
read the value, do not assume it). It is the frozen truth about what this application depends on and
how it is wired. Read it as the answer key:

> **The canonical version is the baseline for everything a new version inherits — never the last
> design version.** A new design version is built *from the canonical public version*, not from the
> most recent entry in the registry. This matters because the two diverge: the canonical version is
> the one that was hardened into production — its conventions, patterns, dependency choices,
> architecture and utilities carry the fixes and decisions made *after* the design version it grew
> from was frozen. The last design version in the registry is a snapshot that stopped evolving the
> day it was approved; it may be **stale** relative to the production-ready work done on canonical.
> So whenever this prompt says to follow "the pattern", copy "the architecture", or reuse "what the
> app already is", read it from the canonical version. Do not lift conventions, wiring shapes,
> utilities or infrastructure usage from an older design version — reach past it to canonical, which
> is the current truth.

- **Dependencies are assumed present and reused.** If the canonical version — or any shipped code —
  already depends on a library, that library is available to your design version *at the same major
  version already resolved in the lockfile*. Do not ask whether you "may" use it; do not ask which
  version; do not propose an alternative. Read `FRONTEND_PACKAGE/package.json` and the lockfile and
  reuse what is there. `mapbox-gl` is the worked example: the canonical version renders maps with
  it, so a design version that shows a map uses the same `mapbox-gl`, full stop.
- **Environment-backed resources are assumed configured.** A dependency's runtime resource — an API
  token, a service URL, a feature key — is part of "the dependency is available". If the canonical
  version reads it, it is configured. Confirm it by reading the app's environment file
  (`APP_REPO/.env` and any `.env.example`) rather than by asking: `VITE_MAPBOX_TOKEN` is present in
  `.env`, so the map renders and there is nothing to ask. The design version consumes the
  same key through the same accessor the canonical version uses; it never introduces its own.
- **Architecture is copied, never chosen.** How data is fetched, how state is held, how the map or
  any other heavy widget is mounted and torn down — the canonical version has already decided all of
  it. Follow its pattern. "Which architecture should I use" is never a designer's question because it
  is never an *open* question: the app answers it.
- **A genuinely absent dependency is a developer's finding, not a designer's question.** In the rare
  case the export truly needs something nothing in the app provides, that is out of this prompt's
  scope. Record it in the final report as a note for the developer (roles.md: the developer owns the
  codebase and its dependencies) — do not add the dependency yourself, and do not ask the designer to
  adjudicate it.

The test for any doubt that arises while porting: *could the canonical version already answer this?*
For anything touching libraries, versions, config keys or architecture the answer is yes — so go
read it. The only doubts that ever reach the designer are the two **design-content** flags this
prompt already names (§4.3 icon concepts, §7.1 cross-version links), never a technical one.

### 1.2 Confirm the preview runtime starts — it is a precondition, not a later step

Rule 7 makes the runtime a property of the version. Everything this prompt creates is
`wired: false`, so the runtime is whichever of two commands **the host's bindings** name for that
case — never a third one you assemble. Establish that it starts *now*, before you port a single
screen, so a broken environment surfaces as an orientation finding rather than as a mystery at the
gate.

**Pick the command from the bindings, in this order. Do not improvise one.**

1. **`DESIGN_PREVIEW_CMD` is set** — use it. It is the host's design-preview seam: the frontend dev
   server *plus* an administrator session held without an auth backend.
2. **`DESIGN_PREVIEW_CMD` is empty** — the host is stating it has no seam. Use `FULL_STACK_CMD`, and
   record in the report that the full stack was required because this host declares no seam. That
   is host requirement 6 being optional, working as intended, not a missing binding to work around.

**There is no third option, and `FRONTEND_ONLY_CMD` is not it.** It starts the server and seeds
nothing. `/design/*` is administrator-only and redirects a non-administrator to the public app —
measured on the reference implementation, demoting the session to a non-admin role redirected
`/design/v2.0.0` straight to `/`. So the frontend alone gets you a running app and no way into the
version, which is the most convincing possible way to look like the work is broken. Booting the
frontend and reaching the design version are two different things, and only the first is free.
`FRONTEND_ONLY_CMD` is what a `DESIGN_PREVIEW_CMD` implementation *wraps* — seed a session, then
start the frontend — and a host that has not built that wrapper has `DESIGN_PREVIEW_CMD` empty,
which is case 2 above. Do not assemble the seam yourself, and do not reach for
`FRONTEND_ONLY_CMD` because `FULL_STACK_CMD` is expensive: the expense is the honest price of a
host that has not adopted host requirement 6, and reporting it is how that host finds out it is
worth adopting.

- **Confirm it starts and the app answers.** Run the chosen command and confirm the app responds at
  `PREVIEW_URL_BASE`. If the command does not exist, or its prerequisites are not in place, **the
  environment is not ready and that is a developer/setup finding to report** — not something to
  paper over with a different command.
- **Confirm you can reach an administrator view.** Whichever runtime you chose, the browser check in
  §9 has to actually open `/design/vX.Y.Z`. Confirm now that the session you will be running under
  is an administrator one, not at the gate.
- **Do not check at the unprefixed root.** With no backend, the app falls back to the *first*
  registered production version, which is typically the older one — so `/` tells you nothing about
  whether your preview works. `PREVIEW_URL_BASE/design/vX.Y.Z` is reached by prefix and is the only
  place to look.

The same command is used by §9's browser walk and §11's gate. Do not proceed to porting until it
starts cleanly and the app is reachable. State plainly in the orientation report **which** command
you used and why.

## 2. Ask which increment

**Two different things are decided here, and conflating them is the classic mistake.** One is the
*number* of the new version — which is computed relative to an existing entry in the registry. The
other is the *code baseline* — the source of truth you copy conventions, patterns and architecture
from — which is **always the canonical public version, never a design version** (§1.1). This step is
only about the number. The baseline is settled: it is canonical.

**Never guess the increment.** List every design version in **registry order** — the whole list, not
a summary — and name which one you are proposing to number *from*:

```
Design versions, in registry order:
  1. v4.0.0            <- version-number predecessor (numbering only; NOT the code baseline)
  2. pt-v1.0.0-tech       a -tech revision of another family; not a numbering predecessor

  X — new design language or reworked flow  ->  v5.0.0
  Y — new screens or flow additions         ->  v4.1.0
  Z — refinements to existing screens       ->  v4.0.1
```

Two rules for picking the **numbering predecessor**, and the second is easy to miss:

- **Order is array position, never a sort.** Under semver, `4.1.0-tech` is a prerelease and sorts
  *before* `4.1.0` — the exact inverse of the truth, since a tech revision comes after the version
  it revises. These labels are opaque strings; never feed them to a semver comparator.
- **The last entry is not automatically the predecessor.** A registry holds more than one family,
  and a `-tech` revision is a technologist's branch off a version, not the next one in line. The
  numbering predecessor is the last plain `vX.Y.Z` in the family this work continues. In the
  reference implementation the last design entry is `pt-v1.0.0-tech` and the numbering predecessor
  is `v4.0.0`.

**The numbering predecessor names the new version; it does not seed its code.** This is the whole
point of the split above. `v4.1.0` is numbered *after* `v4.0.0`, but its screens, conventions,
wiring shapes and utilities are copied from the **canonical public version** — the current
production-ready truth — not from `v4.0.0`'s folder. `v4.0.0` may be stale: production-hardening
happened on canonical after `v4.0.0` was frozen, and lifting from `v4.0.0` would silently reintroduce
whatever canonical has since fixed. Take the number from the predecessor; take everything else from
canonical (§1.1, §7).

If which family this continues is not obvious from `SUMMARY`, ask that too — it is the same
question and the designer answers both at once.

Wait for the answer. Compute `vX.Y.Z` from it and use that name everywhere: the folder, the
registry id, the staging folder, the branch names, the magic word.

## 3. Branch the application repo

```bash
cd APP_REPO && git checkout -b design/vX.Y.Z
```

Cut it from its current branch. Report the base it was cut from — if the repo was already on a
feature branch, say so, because the resulting PR will contain that work too. **Record the base
commit**: §9's changed-path guard needs it to see everything this run has written, committed or
not.

**The design-system branch is not cut here.** Whether `DS_REPO` is touched at all is not known
until §4.2 classifies the export's components, and on a meaningful share of runs the answer is
*not at all* (§4.2). Cutting a branch nobody commits to leaves a stray branch per run in a shared
repo. So `DS_REPO`'s branch — same name, `design/vX.Y.Z` — is cut at the top of §4.4, which is
reached only when the staging set is non-empty.

If either repo has uncommitted changes, stop and ask. Do not stash someone else's work. Check
`DS_REPO` now even though you are not branching it yet: finding it dirty three steps later, with
staged work already written, is worse.

---

## 4. Reconcile the design system — and diff before you stage

This is the step that goes wrong quietly, so it comes before any code.

### 4.1 Inventory every component the export uses

Walk `SOURCE_PATH` and list every UI component and pattern it renders. Do not filter yet.

### 4.2 Diff each one against the SHIPPED design system

**A component the export uses is not automatically a staging candidate.** Read
`DS_REPO/src/index.ts` and `DS_REPO/src/components/` and classify every entry into exactly one
of three buckets:

| Bucket | Meaning | What you do |
|---|---|---|
| **Adoption gap** | the design system already ships this, under this name or another | **Nothing goes into staging.** The screens import the shipped component. Record it in the report as a gap the export had, not as work. |
| **Genuinely new** | nothing shipped covers it | Stage it. |
| **Changed** | a shipped component exists but this version needs different behaviour or props | Stage an override, and record precisely what differs and whether the props stay compatible. |

The bucket that gets skipped is the first, and skipping it is how the design system drifts. A
real measurement, from the version this process was built around: five components looked like
design-system deltas; `V4Avatar` and `V4Icon` turned out to be **byte-identical to their v3
twins** *and* reimplementations of `Avatar` and `Icon`, which the system already shipped. Two
more were application shell and a strict subset of an existing component. Exactly one was new.
A prompt that stages whatever the export contains manufactures four near-duplicates per run.

Match on **behaviour and props, not on name**. An export calling something `Panel` may well be
`Card`; an export calling something `Card` may not be.

Present the table and the count in each bucket before writing a line of component code.

#### The lane is conditional, and the table is what decides it

**If "genuinely new" and "changed" are both empty, this version stages nothing.** That is not a
degenerate case to be handled grudgingly; given the measurement two paragraphs up, it is a likely
outcome. When it happens:

> **Skip §4.4, §4.5, §5 and §6 entirely** — and with them `DS_REPO`'s branch (§3 defers it to §4.4
> for exactly this reason), `DS_REPO`'s checks in §9, `DS_REPO`'s commit (§10) and `DS_REPO`'s pull
> request (§12). The screens import shipped components from `DS_PACKAGE_NAME`. **The design-system
> pin does not move**, `package.json` and the lockfile are untouched, and the publish mode from
> Inputs becomes irrelevant because there is nothing to publish.

One repo, one branch, one commit, one pull request — and the `@`-scoped registry token the design
system needs is not required on the designer's machine at all.

**Report it as the finding it is, never as a silent omission:** *"the export had n adoption gaps
and needed no new components; nothing was staged."* A run that quietly produces no design-system
work looks identical to a run that forgot to do it. The count is the difference, which is why it
is item 2 of the final report and not a footnote.

Everything from here to §6 assumes the staging set is non-empty. If it is empty, go to §7.

### 4.3 Icons are frozen, and that is the interesting case

The icon registry (`DS_REPO/src/lib/icons.ts`) is a curated set of semantic concepts, and it is
shipped — therefore frozen for this cycle. An export that wants `trophy`, `swords` or any other
glyph the registry does not have **cannot get it by editing that file**.

What to do instead, in order of preference:

1. **Use an existing concept.** The registry is semantic on purpose: one icon per concept. Look
   for the concept, not the glyph.
2. **Take the icon as a prop.** A staged component that types its icon slots as `ReactNode`
   rather than as a registry name lets the caller pass any glyph and keeps the component
   reusable. This is a pattern worth teaching, not a workaround — the staged `InsightCard` does
   exactly this, and the note in its header says why.
3. **Record it for promotion.** If the version genuinely needs a new *concept* in the shipped
   registry, write it into the PR description as a promotion decision for prompt 05. Do not make
   it here.

The same reasoning applies to tokens: staged components use the shipped CSS variables
(`var(--color-success)` and friends). They do not add new ones to the shipped theme.

### 4.4 Create the staging version

**Reached only when §4.2's "genuinely new" or "changed" bucket is non-empty.** Cut the
design-system branch now, from its current branch, and report the base — this is §3's second half,
deferred to the point where it is known to be needed:

```bash
cd DS_REPO && git checkout -b design/vX.Y.Z
```

```
DS_REPO/src/staging/
  vX.Y.Z/
    components/          one file per component
    index.ts             this version's build entry
    staging.css          this version's stylesheet
    <Name>.stories.tsx   one per component
  index.ts               the aggregate — ONE line, which you replace
```

**Copy, never import across versions.** If this version wants a component an earlier staging
version has, copy the file in. Two staging versions share no code, for the same reason two design
versions share none: either must be deletable without touching the other.

**The entry, `src/staging/vX.Y.Z/index.ts`** — keep this exact shape. The isolation check parses
it, and `export *` is refused because it hides the version's surface behind the module graph:

```ts
import "./staging.css";

export { InsightCard } from "./components/InsightCard";
export type { InsightCardProps, InsightPoint } from "./components/InsightCard";
```

**The stylesheet, `src/staging/vX.Y.Z/staging.css`** — one line matters, and getting it wrong
fails *silently*:

```css
@import "tailwindcss/utilities.css" source("./");
```

- `utilities.css`, not `tailwindcss`: the full import also emits preflight and the default theme,
  and an app loading both stylesheets gets every base reset twice.
- `source("./")` scopes scanning to this version's directory. Without it, detection scans the
  whole project and another staging version's classes land in your file.
- **Do not write `@reference "../../index.css"`.** It looks like the way to borrow the design
  system's theme and it is a trap: `@reference` inherits the referenced file's *source
  configuration*, including its `@source not "./staging"`, so your stylesheet excludes its own
  directory and emits **nothing**. The components render unstyled and **no error appears
  anywhere** — not in the build, not in the console. It is not needed either: theme utilities
  compile to `var(--color-…)` regardless, and those variables come from `index.css`, which the
  app already loads.
- `source(none)` disables generation entirely. A plain `@source "./components"` is *additive* and
  does not turn automatic detection off — only the `not` form excludes.

Component-specific classes and keyframes (`.uds-insight-header`, animation definitions) belong in
this stylesheet, beside the component that uses them, and travel with it at promotion.

**Hand-written declarations use the raw semantic tokens, not the Tailwind theme names.**

```css
background: var(--primary);          /* right */
background: var(--color-primary);    /* resolves to NOTHING at runtime */
```

If the design system declares its theme with `@theme inline` — the reference implementation does
— then `inline` means Tailwind *substitutes* those names where a utility uses them, and never
emits `--color-*` as a custom property. Written the wrong way, a gradient resolves to nothing and
the header renders white text on white. There is no error: the build is clean, the console is
clean, and the emitted CSS still contains the declaration, so even reading `dist/` does not show
it. Worse, Tailwind quietly *rewrites* a `color-mix()` whose argument it cannot resolve rather
than complaining.

Check what actually exists before writing a token by hand:

```bash
grep -o -- "--[a-z-]*:" DS_REPO/dist/index.css | sort -u
```

This is not hypothetical: a component staged in the previous cycle carried a gradient that had
been dead since the day it was written, and the only thing that ever revealed it was opening the
page in a browser.

**The aggregate, `src/staging/index.ts`** — exactly one re-export line, which you **replace**:

```ts
export * from "./vX.Y.Z/index";
```

Newest is *declared* here, not computed, because nothing can compute it: the labels are opaque
and a sort gets `-tech` backwards. A second `export *` line makes this the union of two versions
rather than the newest of them, and any name they both export — the norm, since versions copy
components — becomes ambiguous and silently unavailable.

**Stories**, one per new and changed component, titled `Staging/vX.Y.Z/<Name>` so the staged work
gets its own tree in the sidebar and cannot be mistaken for something the system ships. Import
from **`./index`** — this version's entry — never `../index`, which is the aggregate and follows
whichever version is newest. A story that reaches for the aggregate stops compiling the day
somebody stages the next version.

### 4.5 Add the subpath exports

In `DS_REPO/package.json`, add two keys per staging version and repoint the unpinned alias:

```json
"./staging":            { "import": "./dist/staging/vX.Y.Z/index.js", "types": "./dist/staging/index.d.ts" },
"./staging.css":        "./dist/staging/vX.Y.Z/index.css",
"./staging/vX.Y.Z":     { "import": "./dist/staging/vX.Y.Z/index.js", "types": "./dist/staging/vX.Y.Z/index.d.ts" },
"./staging/vX.Y.Z.css": "./dist/staging/vX.Y.Z/index.css"
```

Leave every earlier version's pair exactly as it is. `./staging` and `./staging.css` are an
**alias for the newest version** and move each cycle; the pinned pairs never move.

The build enumerates `src/staging/*` and refuses to finish if the map and the folders disagree,
so a forgotten entry is caught rather than shipped. It shipped once: `./staging` and
`./staging/v4.0.0` both pointed at one file, and the moment a second staging version existed, a
consumer importing `InsightCard` from `/staging/v4.0.0` received `undefined` — with types that
still promised a component, so it typechecked clean and failed at render.

---

## 5. Version, build and publish the design system

**Reached only when §4.2's staging set is non-empty.** If it is empty, this whole section and §6
do not happen; go to §7.

### 5.1 Bump the design-system package version — automatically, by rule

Do not ask the designer; there is nothing for them to decide. The rule is mechanical:

| What this run did to staging | Bump |
|---|---|
| added a new `staging/vX.Y.Z/` folder | **minor** — `0.5.1` → `0.6.0` |
| changed components inside an existing staging folder | **patch** — `0.5.1` → `0.5.2` |
| anything else | you are outside this prompt. Stop and report. |

**Never a major bump.** A major belongs to promotion (prompt 05), where a breaking props diff is
the reason for it, and that is the technologist's decision.

The design-system package version and the design version are separate lifecycles and are never
derived from one another. The package version is real semver and is compared. The design version
is an opaque label and is not.

### 5.2 Build

Run **`DS_GATE_CMDS`'s `build` part** — the design system's own build command, from the bindings
block, never a literal `pnpm build` (which at the host root builds the *host*). §9.2 runs the same
binding's remaining parts as the gate's second half.

This runs the shipped pass, then one pass per staging version, then the exports and isolation
guards. Read the guards' output at the end — it names every staging version and exactly what each
one exports:

```
  staging exports OK: 2 version(s) [v4.0.0, v4.1.0], "./staging" aliases v4.1.0
  v4.0.0: exports [InsightCard]
  v4.1.0: exports [Scorecard]
  staging isolation OK: 2 version(s), no cross-version leakage
```

Check that your version's line lists what you meant to stage and nothing else. If a version
exports something its own `index.ts` does not declare, another version has leaked into it and the
build stops.

`DS_REPO`'s build **does** typecheck (`tsc && vite build`). The application's build does **not**
— esbuild strips types without checking them, so the app needs its `typecheck` script run
explicitly. Do not carry the assumption in either direction.

### 5.3 Publish — and when, which is now the interesting part

The publish itself has not changed:

```bash
cd DS_REPO && pnpm publish
```

`prepublishOnly` asks the registry what versions already exist and refuses anything that does not
advance past the highest one. When you do run it, confirm the version is live before continuing —
the app's commit must build on a clean checkout using the registry alone.

**What has changed is when it runs, and the default is now "not here".**

| Mode | Publish happens | What it means for this step |
|---|---|---|
| `--publish-on-approve` **(default)** | §12, with the push | **do not publish here.** Build (§5.2) and verify locally, then go on. |
| `--publish` | here, §5.3 | publish now, and say in the report that a permanent remote act was performed before the gate, and why it was needed |
| `--no-publish` | never | do not publish here or at §12 |

The reason is rule 5, not speed. A registry publish is the most permanent remote act in this run —
a version of a package every other project reads, which cannot be withdrawn — and the old default
performed it at step 5 of 12, before the designer had seen a single screen. A designer who
iterates three times on a staged component burned three permanent versions of the design system to
do it. Moving it to §12 makes rule 5 true.

**The bump in §5.1 still happens here, and so does the build in §5.2.** The version number is
decided and written into `DS_REPO/package.json` now; what is deferred is only the act of pushing
bytes to the registry. That keeps the design-system commit complete and self-consistent whenever
it is made.

### 5.4 When the registry cannot be reached

**The guard fails rather than passes when it cannot see the registry.** That is deliberate: a
guard that waves you through when it is blind reads as a green check. If you get
`Could not reach the registry`, it is doing its job.

This applies wherever the publish actually runs — §5.3 under `--publish`, §12 under the default.
Two legitimate ways forward, and one that is not:

- **Fall back to `--no-publish`.** Everything is prepared and committed; a networked machine
  publishes and repins later. Say so plainly in the report.
- **The designer sets `ALLOW_UNVERIFIED_PUBLISH=1` themselves**, deliberately, in their own
  shell. **You must never set it.** It is meant to be visible in shell history and typed by a
  human who knows they are publishing blind.
- **Not** a `file:` or `link:` reference to get past it. See rule 2.

### 5.5 What an unpublished staging version costs, stated honestly

This used to be `--no-publish`'s cost alone. Under `--publish-on-approve` it is the **default
path's** cost during iteration, so it is stated up front rather than as a warning on a flag nobody
reads. It applies only when §4.2's staging set is non-empty; when it is empty there is no subpath,
no pin move and no cost at all.

While the new staging subpath does not exist on the registry:

- the app cannot install it, and a screen's imports of it **will not resolve**;
- the `typecheck`, `test` and `build` parts of §9's gate, and §9's browser walk, **cannot cover any
  screen that imports a genuinely new staged component**;
- **do not repin the app** to an unpublished version, and **do not** fake it with a local link.

Name the affected screens and the affected checks explicitly. "Verification could not run" without
saying *for what* is indistinguishable from not having tried.

**Two things about this that are easy to get wrong.**

- **A patch bump is the dangerous one, because the imports resolve.** §5.1 bumps *patch* when this
  run changed components inside an *existing* staging folder — which means that subpath already
  exists at the previously published version, so `^` resolves it and every check runs green.
  Against the *old* bytes. Nothing errors, and the report reads as verified. Say explicitly, in
  that case, that the checks ran against the last published staging content and not against what
  this run staged.
- **A "changed" component is affected exactly as a new one is** if the screen imports it from
  `DS_PACKAGE_NAME/staging/vX.Y.Z` and that pinned subpath is new. The bucket name in §4.2 is about
  the design system's history, not about whether the import resolves today.

Write the imports as they will be, commit, and report exactly which verifications could not run
and why. Until the publish lands this is a *prepare* run for the staged half. Never report it as
verified.

## 6. Repin the application

**Reached only when §4.2's staging set is non-empty** — when nothing is staged the pin does not
move, and `package.json` and the lockfile stay out of this run's diff entirely.

```bash
# FRONTEND_PACKAGE/package.json
"DS_PACKAGE_NAME": "^<new version>"
```

Write the pin **now, in every mode** — it is part of the commit, and a commit carrying last
version's pin beside this version's imports is a broken commit.

**Installing is a different question, and it follows the publish.** The lockfile can only record a
version the registry actually serves:

- `--publish` — install in `APP_REPO` with the host's package manager and confirm the resolved
  version is the one just published, here and now.
- `--publish-on-approve` **(default)** and `--no-publish` — **do not install yet.** There is
  nothing on the registry to resolve, and forcing it produces either a failure or, worse, a
  lockfile pinned to the previous version while `package.json` says otherwise. The install happens
  in §12, immediately after the publish, and its lockfile change is folded into the existing
  application commit by amending it — the branch has not been pushed, so amending is free, and
  rule 3's one-commit-per-repo holds. Under `--no-publish` it does not happen at all, and the
  report says so.

Repin on **every** publish, including a patch. `^0.5.0` on a `0.x` package means
`>=0.5.0 <0.6.0`, so a minor bump is invisible without a repin — and pinning on patches too keeps
the lockfile an honest record of which design system the version was built against.

Then confirm no local-path reference to the design system exists anywhere in `APP_REPO`:

```bash
grep -rn '"DS_PACKAGE_NAME": *"\(file\|link\|workspace\|portal\):' APP_REPO --include=package.json
```

---

## 7. Port the screens

Into `FRONTEND_PACKAGE/src/pages/design/vX.Y.Z/`, using the **folder layout** an existing design
version shows — `components/` for this version's composites, `data/` for mocks, screens at the top
or under `screens/` — match what the codebase already does.

**Match layout from any version; take patterns and conventions only from canonical.** The folder
*shape* is a stable convention, so copying it from the nearest design version is fine. Everything
that is *code* — how navigation is wired, how state and data are shaped, which utilities and hooks
are used, how heavy widgets are mounted — comes from the **canonical public version** (§1.1), which
is the production-ready truth. Do not copy that code from an older design version: it froze the day
it was approved and may lag behind the fixes made on canonical since. Read the equivalent canonical
screen and follow *its* patterns, not a stale design version's.

### 7.1 Version-relative navigation — the invariant everything rests on

Design-tool exports arrive full of hardcoded paths, and every one of them must be converted:

```ts
// WRONG — throws a public user onto the versioned URL this architecture exists to hide
navigate("/v3/briefing");
navigate(`/design/vX.Y.Z/project/${event.id}`);
<Link to="/v3/start">

// RIGHT — resolves to "/briefing" canonically and "/design/vX.Y.Z/briefing" when prefixed
const nav = useVersionNav();
nav("/briefing");
nav(`/project/${event.id}`);
<VersionLink to="/start">
```

The same applies to any path that gets *stored* — a post-login redirect, a "return to" value —
which must be persisted base-relative.

An ESLint rule bans these literals inside `src/pages/**`. It is the acceptance criterion, not
polish, and it must report **zero** violations. Its blind spot is paths composed at runtime from
variables — read the ported navigation yourself for those; the rule cannot see them.

**Not every hardcoded path is navigation inside the version.** An export may contain a link *out*
of it — a "back to the app" button pointing at `/start`, which is the canonical public version, not this
one. Converting that with `useVersionNav` is wrong: it would resolve inside the design version and
go somewhere that does not exist. Three honest options, in order:

1. the version has an equivalent screen of its own — convert it, base-relative;
2. it is genuinely a link into the public version — use the host's helper for that
   (`publicVersionPath()` or equivalent), which is outside the ESLint rule's scope by design;
3. neither — **drop it and flag it for the designer**. A cross-version link that was not part of
   the design is not yours to invent.

Say which you chose, per link, in the report.

### 7.2 Imports

```ts
import { Card, Input, Button } from "DS_PACKAGE_NAME";                    // shipped
import { InsightCard } from "DS_PACKAGE_NAME/staging/vX.Y.Z";             // this version's staging
import "DS_PACKAGE_NAME/staging/vX.Y.Z.css";                              // beside the shipped sheet
```

**Always the pinned subpath.** Never `DS_PACKAGE_NAME/staging`, which follows "newest" and would
silently change what this version renders the day somebody stages the next one.

The version may freely import **application infrastructure** — the auth context, the
version-navigation hooks, shared formatting and geometry utilities, the request transport. It
must **not** import from another version's folder. The test: can this folder be deleted in one
`rm -rf` without breaking anything else and without leaving anything of its own behind?

### 7.3 Mocks

All data mocked and colocated in `data/*.ts`. No real service calls. A version created by this
prompt is `wired: false`, and that is the only default. Wiring is prompt 02's job and it is a
separate decision made by a different person.

## 8. Register the version

The registry is scaffolded by this process and held to
`docs/design-version-registry.md` — read it if anything below is unclear about *why*. Guard names
(`auth` in the example) come from the project's own `RouteGuard` union at the top of
`registry.tsx`; use the names that file declares, never invent one.

Append to the design branch of `src/versions/registry.tsx`:

```tsx
{
    id: "vX.Y.Z",
    kind: "design",
    wired: false,
    label: "vX.Y.Z — design",
    entryRoute: "",
    routes: [
        { path: "", component: lazyPage(() => import("../pages/design/vX.Y.Z/EntryPage.js"), "EntryPage"), guard: "auth" },
        { path: "detail/:id", component: lazyPage(() => import("../pages/design/vX.Y.Z/DetailPage.js"), "DetailPage"), guard: "auth" },
        // …one per screen, paths RELATIVE — no "/design/" or "/vN" anywhere in a spec
    ],
},
```

- **Appended**, at the end. Array position is the ordering and the only ordering.
- `entryRoute` must name a route that exists in the list above it — it is where an authenticated
  user lands, relative to the version's base. `""` is the version's root screen and is the right
  answer whenever the version has one.
- Inside the `INCLUDE_DESIGN_VERSIONS` branch, so a flag-off build drops the chunks entirely.
- Every route element `lazy`, so design code never enters the public entry bundle.
- Route paths relative to the version's own base. The router adds the prefix when it mounts.
- No route may claim a reserved root prefix (`login`, `register`, `admin`, `design`, `legacy`,
  `api`, `ws`, `assets`, `v[0-9]+`). The registry asserts this at startup and throws in
  development; do not wait to find out that way.
- `App.tsx` does not change.

## 9. Verify — run it, do not claim it

### 9.1 Establish the scope before you run anything

The gate is narrow **because the write-set is narrow**, and that is a claim about this run's diff,
not a promise about the prompt. So check it first, and let the check decide which gate you run.

**The declared write-set of a prompt-01 run is exactly this:**

| Repo | Path |
|---|---|
| app | `FRONTEND_PACKAGE/src/pages/design/vX.Y.Z/**` — the new page folder |
| app | `FRONTEND_PACKAGE/src/versions/registry.tsx` — one appended row |
| app | `FRONTEND_PACKAGE/package.json` **and the lockfile** — the design-system pin, only when something was staged (§6) |
| DS | `DS_REPO/src/staging/vX.Y.Z/**`, `DS_REPO/src/staging/index.ts`, `DS_REPO/package.json` — only when something was staged (§4.4, §4.5, §5.1) |

Nothing else. Four of the rules that do not bend are what make it true: rule 1 freezes the shipped
design system, rule 3 forbids cross-commits, rule 4 and §8 forbid touching the router and
`App.tsx`. The lockfile is in the set deliberately — an install rewrites it, and a write-set that
omitted it would void itself on every run that stages anything, which is the same as having no
narrow gate.

**Compute what this run actually changed**, in each repo (they may be the same tree under a
`workspace` topology — then compute once):

```bash
git status --porcelain                 # uncommitted
git diff --name-only <base>...HEAD     # committed on this branch, from §3's recorded base
```

Both, unioned. `git status` alone is not enough: on the second and later designer iterations §10
has already committed, the working tree is clean, and a guard reading only `status` would see an
empty change-set and wave through a diff it never looked at.

Then compare, and act on the answer:

- **Every changed path is inside the write-set** → run the narrow gate, §9.2.
- **One single path falls outside it** → **the narrow gate is void.** Run `FULL_GATE_CMDS`, and
  say in the report which path escaped and why the gate was widened. Do not reason about whether
  the stray path "could really matter" — the guard exists because that reasoning is exactly what
  goes wrong.

### 9.2 The narrow gate

Run **`FRONTEND_GATE_CMDS`** — the host's lint, typecheck, test and build, scoped to
`FRONTEND_PACKAGE`. Run every part the binding names; run **only** those parts. A `null` part is
the host saying it has no separate script for it, and synthesizing one makes the host assert
something untrue (see Bindings). In particular, do not conclude that a null `typecheck` means types
go unchecked: on the reference frontend `lint` **is** `tsc --noEmit`. If it genuinely is not
covered anywhere, that is an adoption finding to report, not a command to invent.

Plus, **only when §4.2's staging set is non-empty**, run **`DS_GATE_CMDS`** — the design system's
own four checks. Same rule as above: run every part the binding names, run **only** those parts,
and never synthesize a command for a `null` one. A separate design-system checkout's commands are
unscoped and run from `DS_REPO_PATH`; a workspace-scoped one runs from the host root. The binding
says which shape this host has; do not prefix a `cd` the binding did not ask for.

What they cover is not incidental: `build` is where the staging export map and the cross-version
isolation guard run (§5.2 reads their output line by line), and those are the checks that stop one
staging version leaking into another.

**If every part of `DS_GATE_CMDS` is null while something was staged, stop** — the same rule §9.2
applies to `FRONTEND_GATE_CMDS`, and for the same reason. A run that stages components, executes no
design-system check and reports a pass is the shape this gate exists to prevent. The usual cause is
that `DS_REPO_PATH` is a placeholder, so nothing could be read off the design system's own manifest;
report it against `design-commands/README.md`'s checklist line for `DS_REPO_PATH`, and do not substitute a literal
`pnpm build` — at the host root that runs the *host's* build and reports the design system green
without ever entering it.

**Why this is safe, stated so someone can falsify it:** the gate parts this drops — a host's
backend and engine builds, lints and tests, and its script suites — share **no input** with
`FRONTEND_PACKAGE`. In the reference implementation that is 420 seconds of a 529-second no-op gate,
79% of it, that a file under `pages/design/vX.Y.Z/`, an appended row in `registry.tsx` and a
version range in a `package.json` cannot change the verdict of. The claim holds **only while the
diff stays inside the write-set**, which is why §9.1 is an instruction and not a footnote.

**If every part of `FRONTEND_GATE_CMDS` is null, stop.** The host has named no frontend gate, and a
run that executes nothing and reports a pass is the worst possible outcome of this change — it
looks like the green path. Report it against `design-commands/README.md`'s checklist line *"FRONTEND_GATE_CMDS
scoped to the frontend package, and a full-gate fallback named"* and do not describe the version as
verified.

**If the gate must widen and `FULL_GATE_CMDS` is all null, stop as well, and say why.** All-four-null
is reachable rather than theoretical: a part absent from the package's scripts yields `null`, so a
workspace root with no scripts — or a host with no lockfile and no `packageManager` field, where
the package manager is undetectable and every derived command falls through — produces it. A guard
that reads `FULL_GATE_CMDS` and runs it unconditionally then runs **nothing** and reports a pass,
which is strictly worse than the narrow gate it replaced because it wears the safe branch's colours.
Tell the operator this host has not named a full gate, and **do not fall back to the narrow gate**
— the whole reason to widen was that the narrow one no longer covers the diff.

### 9.3 `build` is not optional, and the routing suite is not on this list

**Run `build`, and read its output.** A design version's routes are lazy, so a version whose chunk
cannot resolve an import at all still passes everything that never opens it. Measured: a version
importing an unpublished staging subpath passed **43 of 43 routing tests and died on the first
module of `vite build`**. `build` is the only check on this list that compiles the version's own
module graph.

**The routing E2E suite is not here, on purpose.** It belongs to CI, per `docs/design-testing.md`
§1, which scopes it to every commit — and running it locally means a compose stack, a seeded
database, the services and Playwright, to assert prefix leakage, the non-admin redirect and which
version answers the root: mechanism this version's screens do not participate in. What it uniquely
catches **for this version's screens** is navigation composed at runtime from variables, which the
ESLint prefix rule is blind to (§7.1) — and that is caught by the browser walk below. Which is
precisely why the walk is not optional and cannot be replaced by a screenshot of one screen.

### 9.4 Look at it in a browser

This is the step that catches what none of the above can. Use the **same command §1.2 established**
— `DESIGN_PREVIEW_CMD`, or `FULL_STACK_CMD` where the host declares no seam — and reach
`PREVIEW_URL_BASE/design/vX.Y.Z` (rule 7 and §1.2).

**`/design/*` requires an administrator.** An ordinary session is sent to the public version
instead, which looks exactly like the version being broken and is not. And **do not check at the
unprefixed root**: with no backend the app falls back to the first registered production version,
typically the older one, so `/` tells you nothing about your version either way.

Walk every screen. Confirm: the screens render as the export intended; the staged components are
**styled**; zero console errors; and the URL bar never shows a path you did not expect, including
after clicking through.

"Styled" deserves its own look rather than a glance. Both silent-failure modes in §4.4 — the
`@reference` trap and the `--color-*` trap — produce a page that renders, does not error, and is
simply missing its colour. Nothing but a human eye or a screenshot finds them.

**Two waits look like failures and are not**, and both were measured. A boot skeleton can sit on
"Loading…" for several seconds while a runtime-config fetch that has no backend to answer it times
out — a screenshot taken too early catches only that. And a map component can need **more than
eight seconds** before tiles paint; measured at eight it reported zero canvases and screenshotted
as a flat black box. Wait, and look again, before reporting either as broken.

Report exactly what you ran and what it printed. Paste failures. **Do not report a check you did
not run**, do not describe a run whose staging version is still unpublished as verified for the
screens that import it (§5.5), and say which runtime you previewed on and why.

## 10. Commit

```bash
cd DS_REPO  && git add -A && git commit    # staging/vX.Y.Z, stories, exports map, version bump
                                           # — ONLY when §4.2's staging set is non-empty
cd APP_REPO && git add -A && git commit    # pages/design/vX.Y.Z, registry entry, repin
```

One commit per repo — **and when nothing was staged, that is one commit in one repo.** `DS_REPO`
has no branch, no diff and no commit on such a run (§4.2), and the absence is a reportable finding,
not something to fill in.

Check `git status` in both afterwards and confirm nothing leaked across. Under
`--publish-on-approve` the application commit is amended once in §12 to pick up the lockfile the
install produces; the branch is unpushed at that point, so it stays one commit.

---

## 11. The gate

Start the runtime **§1.2 established for this version** — `DESIGN_PREVIEW_CMD`, or
`FULL_STACK_CMD` where the host declares no seam (rule 7, §1.2). The version is `wired: false`, so
the frontend is what it needs; what it also needs is an administrator session, which is the seam's
other half and the reason `FRONTEND_ONLY_CMD` alone is not the answer. Confirm the app answers at
`PREVIEW_URL_BASE`, tell the designer the exact URL to open, and **stop**.

```
design/vX.Y.Z is ready to look at:  <PREVIEW_URL_BASE>/design/vX.Y.Z
  (running via <the command you used> — an administrator session is required;
   an ordinary user is redirected to the public app)

Nothing has been pushed and nothing has been published.
Reply with exactly:  APPROVE vX.Y.Z
```

Hand over a running app the designer can get *into*. A designer who lands on the public app instead
of the version, or on a boot skeleton that has not settled, reports the version as broken — and
neither is the version. §9.4 names both.

The designer may iterate with follow-up prompts for as long as they like. Each iteration
re-verifies and returns to this same stop.

Until the exact token `APPROVE vX.Y.Z` arrives — including the version — **no remote operation of
any kind occurs**: no push, no PR, **no registry publish**. It is version-scoped so an approval
cannot be replayed from an earlier cycle onto work nobody looked at. A generic acknowledgement is
not the magic word and must not be treated as one, however enthusiastic. The one exception is a run
the designer explicitly launched with `--publish`, which published at §5.3 — and that run says so
here, in this message, rather than letting "nothing has been pushed" imply more than it means.

This is a convention: a prompt cannot technically prevent a push. The branch policy blocking
direct pushes to the default branch is the real backstop; the magic word is what stops
half-finished work from reaching a pull request in the first place.

## 12. On approval

In this order, because each step depends on the one before it:

1. **Publish the design system**, when the staging set is non-empty and the mode is
   `--publish-on-approve` (§5.3). `--publish` already did this at §5.3; `--no-publish` never does.
   If the registry cannot be reached, §5.4 applies here.
2. **Install in `APP_REPO`** with the host's package manager, confirm the resolved version is the
   one just published, and **amend** the application commit to carry the lockfile (§6, §10). Skip
   under `--no-publish`, and say so.
3. **Re-run the checks §5.5 said could not run** — the screens importing a staged component can now
   resolve it. This is the first moment they have ever been verified; do not skip it because the
   earlier pass was green on everything else.
4. **Push the branches and open the pull requests** using
   `PROCESS_ROOT/templates/pr-description.md`, and print the links. **One repo, one PR** —
   when nothing was staged there is no design-system branch and there is one pull request, not two.

---

## Outputs

- `FRONTEND_PACKAGE/src/pages/design/vX.Y.Z/` and one appended registry entry
- **when, and only when, §4.2's staging set is non-empty:** `DS_REPO/src/staging/vX.Y.Z/` with a
  stylesheet, stories and subpath exports, the design-system pin moved, and a publish — at §12
  under the default, at §5.3 under `--publish`, never under `--no-publish`
- one branch and one commit per repo **that this run touched**, never cross-committed
- one pull request per touched repo — two when something was staged, one when nothing was

## Final report

1. The increment the designer chose and the resulting `vX.Y.Z`.
2. **The three-bucket component table** from §4.2, with the count in each. Adoption gaps are a
   finding worth stating out loud, not a silent omission — and when both other buckets are empty,
   say it in those words: *"n adoption gaps, nothing staged"*, followed by what that skipped
   (§4.4–§6, the design-system branch, commit and pull request). A run that produced no
   design-system work and a run that forgot to look are indistinguishable without this line.
3. Any icon concept the export wanted that the registry does not have, and how it was handled.
4. The new design-system version, **which publish mode was in effect and whether the publish has
   happened yet**, and the app's resolved version — or, when nothing was staged, that the pin did
   not move.
5. The routes, and the URL to open, **and which runtime it is running on** (`DESIGN_PREVIEW_CMD`,
   or `FULL_STACK_CMD` because this host declares no seam).
6. Verification output — which gate ran (`FRONTEND_GATE_CMDS`, or `FULL_GATE_CMDS` and which path
   forced the widening; plus `DS_GATE_CMDS` when something was staged), which parts the bindings
   named `null` and were therefore not run, what it printed, and what could not be run and why
   (§5.5 names the usual reason).
7. The branch names — one per repo this run touched — and confirmation that nothing crossed
   between repos.
8. The gate, restated: nothing pushed, nothing published, waiting for `APPROVE vX.Y.Z`.
