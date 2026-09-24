# 05 — Promote design-system staging

**Run by** the design technologist, when a design version is accepted and its staged components
should become part of the **shipped** design system.

This is the **highest-risk prompt in the set**. Every other operation in this process is provably
safe for the public app — a staging publish leaves the shipped entry byte-identical, a design
version is administrator-only and lazy, moving `PUBLIC_UI_VERSION` is a runtime flip with a one-line
rollback. This one is different: **it changes the shipped components the public app renders.** Treat
every step below as load-bearing.

It **reverses** the staging split. Prompt 01 put new and changed components into
`src/staging/vX.Y.Z/` precisely so they could not touch production; promotion folds them back into
`src/components/` and republishes. The proof that made staging safe — the byte-identical shipped
entry — is the exact thing this prompt is allowed, once, to break.

---

## Bindings

The command wrapper that invoked this prompt carries a bindings block. Read it before anything else;
every path below is relative to it.

| Binding | This repository |
|---|---|
| `APP_REPO` | `.` |
| `DS_REPO` | `../design-system-uds` |
| `FRONTEND_PACKAGE` | `apps/web` |
| `DS_PACKAGE_NAME` | `@my-app/design-system` |

## Inputs

| Input | Notes |
|---|---|
| `STAGING_VERSION` | the staging folder to promote, e.g. `v4.1.0`. Must exist under `DS_REPO/src/staging/`. |
| `BUMP` | `minor` or `major` — **determined by the props diff in step 1, not chosen freely.** If given up front and the diff disagrees, the diff wins and you stop. |

---

## The rules that do not bend

1. **The props diff is a hard stop, not a warning.** On any breaking props change (§1), stop and
   report. Do not "handle it", do not fold anyway, do not silently take a major bump. The
   technologist decides. This is the whole reason the prompt exists.
2. **A major bump is never silent.** `minor` is for additive change. `major` happens only when the
   technologist, having seen the props diff, accepts breaking the API and has reviewed every
   consumer. An agent never upgrades `minor` to `major` on its own.
3. **This release legitimately changes the shipped entry — and it is the *only* one that may.** The
   byte-identity guard (`check-shipped-entry-identity.mjs`) blocks any release that alters the
   shipped files. A promotion must alter them. It gets through **only** when a human states the
   acknowledgement out loud, by ticking `allow_shipped_entry_change` on the design system's release
   workflow — exactly the `ALLOW_UNVERIFIED_PUBLISH` pattern, moved off a laptop so it leaves a
   record of who and when. **You must never set it, and you never run the release.** It belongs to
   someone who knows they are changing what the world renders.
4. **Never `file:`, `link:`, `workspace:` or `portal:`** for the design system. Consumers repin to
   the published version, `^x.y.z`, and nothing about promotion changes that.
5. **Two repos, two branches, two commits** — the DS repo for the fold, each consuming app for its
   repin. Never cross-commit.
6. **The public app is verified in a browser before this prompt reports success.** Building is not
   verifying. Step 6 is the first and only moment in the whole process where the public app can
   regress, and only a browser sees it.

---

## 1. Props diff — the hard stop

For every component in `DS_REPO/src/staging/STAGING_VERSION/components/` that **overrides a shipped
one** (a component of the same name, or the same behaviour under a different name, already in
`src/components/`), diff the props API of the staged version against the shipped version.

A component that is **purely new** — nothing shipped covers it — has nothing to diff and is additive
by definition. Note it and move on.

For an override, compare the two prop interfaces and classify the change:

| Change | Verdict |
|---|---|
| a prop added, optional | **compatible** — additive |
| a prop removed | **breaking** — a caller passing it no longer typechecks / loses behaviour |
| a required prop added | **breaking** — every existing call site is now a type error |
| an optional prop made required | **breaking** |
| a prop's type narrowed (`string` → `"a" \| "b"`, wider union → narrower) | **breaking** |
| a prop's type widened (`"a" \| "b"` → `string`) | compatible |
| a default value changed | **breaking** — existing call sites silently render differently |
| required-ness or default otherwise changed | **breaking** |

Read the actual `interface`/`type` for each side, not the usage. To surface the shipped props for a
component, read `src/components/<Name>.tsx` and its exported `<Name>Props`; for the staged side, read
`src/staging/STAGING_VERSION/components/<Name>.tsx`.

**On any breaking change:**

```
PROMOTION BLOCKED — breaking props change

  <Name>:  <what changed>, e.g. "removed prop `tone`", "default `size` 'md' → 'lg'"
  effect:  <which shipped call sites break>

This is a hard stop. Two ways forward, both the technologist's decision:
  - make the staged component backward-compatible (keep the prop, keep the default), then rerun; or
  - accept a MAJOR bump, having reviewed every consumer of the shipped component.

Not proceeding.
```

Then stop. Do not continue to the fold. If the technologist decides on a major, they say so and
name it; `BUMP` becomes `major` and you resume from step 2 — never before.

If every override is compatible, `BUMP` is `minor`. Report the diff for each override even when it
passes: "props compatible" is a claim someone should be able to check.

## 1.5 The contribution gate — where this component lands

Numbered here because it has to be answered before anything is folded or published. It reads the
diff §1 just produced: the components this promotion would **add** to the shipped surface, and the
shipped components it would **change**.

Put that list to the technologist as one three-way question, per component. Do not answer it
yourself — whether a component belongs to every project is a judgement, and so is whether it is
worth a design-system version. Both stay with a person, for the same reason promoting a public
version does.

| Answer | What you do |
|---|---|
| **contribute** | the component graduates into `DS_REPO`. Branch, apply the fold, push, and **open a pull request against `PTV-Mobility/design-system-uds`** with the body already written from [`../templates/pr-description.md`](../templates/pr-description.md). You do **not** merge it, and you do **not** release it — the tag, the publish and the shipped-entry acknowledgement all belong to that repository's own workflow, run by a person who has read the diff |
| **deliberately local** | the component stays in `FRONTEND_PACKAGE`, and you **record it** in `docs/design-local-components.md`: the component, the version that introduced it, and the reason in one sentence. Nothing is folded and nothing is published |
| **defer** | nothing happens, and nothing is recorded. The component ships locally with no record, which is exactly what the deferral report counts |

Three things about this gate are load-bearing.

**The pull request, not a push.** Promotion is the one operation allowed to change what the public
app renders, and it now changes it for *every* project on the design system. A branch and a pull
request put that in front of a reviewer who does not already believe the change is right. It also
puts the release on CI rather than on a laptop: the shipped-entry guard and the visual baselines
run there, where their output is a record.

**Deliberately local has to be recorded, or the question decays.** Left unrecorded, the same
component is re-asked about on every promotion, and within a month people answer *defer* by
reflex. The record is one table row and it is the thing that keeps the gate meaningful.

**Deferral has to stay visible.** The report of components this project ships locally that are
absent from the design-system version it depends on — and that carry no record — is the honest
measure of whether this arrangement is working. A long list is not a failure of the gate; it is
the gate telling you something.

If every component is answered *deliberately local* or *defer*, there is nothing to promote: write
the records, say so, and stop. Steps 2 through 6 are about the contributed set.

## 2. Visual snapshots — before

Promotion is the one moment shipped components can drift visually — two pixels more padding on a
staged override than the shipped one it replaces, which the props diff cannot see. So snapshot the
shipped Storybook stories **before** folding anything:

```bash
cd DS_REPO && pnpm test:visual            # captures / compares Playwright screenshots of the shipped stories
```

These are local Playwright screenshots of the **shipped** stories, with committed baselines (see
`docs/design-testing.md` §3 — Chromatic was removed for this). A
clean run here establishes the "before". You will run it again in step 4 after the fold, and report
every diff for human review. Diffs are **never auto-accepted** — a real visual change is the
technologist's to approve, and an approved change means committing the new baseline deliberately.

## 3. Fold

Move each staged component into the shipped set. Order matters — code, then exports, then styles.

**Components.** Move `src/staging/STAGING_VERSION/components/*` into `src/components/`. For an
override, this replaces the shipped file; for a new component, it is a new file. If the staged
component inlined helpers that the shipped tree already provides (`cn`, `Icon`, a glyph set — the
staging bundle is self-contained on purpose), rewire those imports to the shipped `src/lib`/
`src/components` versions rather than carrying a second copy into the shipped entry.

**Exports.** Merge the staged component's exports into `src/index.ts` — the component and its prop
types — in the same style as the surrounding exports. For an override, the export line already
exists; confirm the types it names still match.

**Styles — two silent traps live here.** Merge `src/staging/STAGING_VERSION/staging.css` into
`src/index.css`:

1. **The component's own classes and keyframes move with it.** A staged component's
   `.uds-insight-header`, its `@keyframes`, its bespoke gradient — all of it lives in `staging.css`
   today and must land in `index.css`, or the promoted component renders unstyled. Do not leave it
   behind in a folder you are about to delete.
2. **Hand-written declarations use the RAW tokens, never the Tailwind theme names.** `index.css`
   declares its theme with `@theme inline`, which means Tailwind *substitutes* `--color-*` where a
   utility uses them and **never emits them as custom properties**. A hand-written
   `var(--color-primary)` resolves to nothing at runtime — no error, clean build, the declaration
   still visible in `dist/`, and the header renders white-on-white. Use the raw tokens:

   ```css
   background: var(--primary);          /* right */
   background: var(--color-primary);    /* resolves to NOTHING at runtime */
   ```

   The staging stylesheet may already be correct (prompt 01 requires it), but promotion is a
   *rewrite* of those declarations into a different file, so check every one. Confirm what exists:

   ```bash
   grep -o -- "--[a-z-]*:" DS_REPO/dist/index.css | sort -u
   ```

   `--surface` does not exist; `--primary`, `--info`, `--success`, `--border`, `--card` do.

Do **not** merge the `@import "tailwindcss/utilities.css" source("./")` line from `staging.css` —
`index.css` has its own Tailwind setup and its own source scoping. You are merging the
*component-specific* declarations, not the staging file's Tailwind plumbing.

**Stories.** Move `src/staging/STAGING_VERSION/*.stories.tsx` into the shipped Storybook set,
retitling from `Staging/STAGING_VERSION/<Name>` to wherever the shipped stories live (e.g.
`Components/<Name>`), and repoint their imports from the staging entry to the package root / shipped
source. These become part of the shipped baseline for future promotions.

## 4. Delete the staging version, and prove the removal was clean

Remove every trace of the promoted staging version:

- `src/staging/STAGING_VERSION/` — the whole folder (components, `index.ts`, `staging.css`,
  stories), now that everything in it has been folded or moved.
- In `package.json`, the four `exports` keys for it: `./staging/STAGING_VERSION`,
  `./staging/STAGING_VERSION.css`, and — **if this was the newest version** — repoint the unpinned
  `./staging` and `./staging.css` aliases to whatever version is now newest, or remove them if no
  staging version remains.
- In `src/staging/index.ts` (the aggregate), the `export *` line for it — repointing the single
  "newest" re-export to the now-newest version, or emptying it if none remains.

Then let the guards prove it:

```bash
cd DS_REPO && pnpm build     # runs check-staging-exports.mjs and check-staging-isolation.mjs
```

With the version gone, both guards must go **green** — exports ↔ folders ↔ newest all agree, and no
artefact leaks. A red guard here means a dangling subpath, a stale aggregate line, or a folder half
removed. That green is the proof the removal was clean; it is not optional.

**Visual snapshots — after.** Re-run the shipped-story snapshots and diff against the "before":

```bash
cd DS_REPO && pnpm test:visual
```

Report every visual diff for human review (rule §2). A diff on a component you overrode is expected;
a diff on a component you did *not* touch is a leak and a red flag.

## 5. Release — the one release that changes the shipped entry

**Nothing publishes from this run, and nothing publishes from a laptop.** The fold went out as a
pull request (§1.5). The release happens in `DS_REPO`'s own workflow, after that pull request is
reviewed and merged, and is someone else's hand on the button.

What this step does is prepare it. Bump `DS_REPO/package.json` per the props diff — `minor` for
additive, `major` only if the diff was breaking and the technologist accepted it (rules 1–2) — in
the same branch as the fold, so the version and the change it describes are reviewed together.

Two guards then run in `prepublishOnly`, on the runner:

- `check-version-advances.mjs` — refuses a version that does not advance past the registry. Fails
  closed if it cannot reach the registry; that is deliberate.
- `check-shipped-entry-identity.mjs` — the byte-identity guard. **It will refuse this release**,
  because a promotion changes the shipped files, and that is exactly what it is for on every
  *other* release. This is the one release it must let through, and it does so only when a human
  states the acknowledgement where it leaves a record (rule 3):

  > Actions → **Release** → *Run workflow*, with **`allow_shipped_entry_change`** ticked.

  The tick names who ran it and when. `ALLOW_SHIPPED_ENTRY_CHANGE=1 pnpm publish` on a machine
  sets the same variable and records nothing, which is precisely why it is not the path.

  **You neither tick it nor run the workflow.** Present the change — the props diff outcome, the
  visual diffs, the bump — and hand it over.

**Check that the design system actually has that input, and stop if it does not.** Read
`DS_REPO/.github/workflows/release.yml`. `design-system-base` has the `workflow_dispatch` input;
`design-system-uds` today releases **only** on a `v*` tag push, and a tag push carries no way to
state the acknowledgement — so the guard refuses, the run fails, and nothing is published. That is
the guard working. Do not route around it with a local publish: report it, and say that the fix is
one workflow file copied from `design-system-base` into the design system being released.

If the registry is unreachable, the same two legitimate ways forward as prompt 01 §5.4 apply
(`ALLOW_UNVERIFIED_PUBLISH=1`, set by the human, or defer) — never a local link.

Confirm the new version is live on the registry before repinning. Until the pull request is merged
and the release has run, §6 has nothing to repin to — say so and stop rather than repinning to a
version that does not exist.

## 6. Repin and verify the public app

Repin **every** consuming app to the new version:

```bash
# FRONTEND_PACKAGE/package.json
"DS_PACKAGE_NAME": "^<new version>"
```

Then `pnpm install` in `APP_REPO`, confirm the resolved version is the one just published, and
confirm no local-path reference survives:

```bash
grep -rn '"DS_PACKAGE_NAME": *"\(file\|link\|workspace\|portal\):' APP_REPO --include=package.json
```

Now verify — and this is the step nothing else substitutes for:

```bash
pnpm --filter <frontend> build          # the app's build does NOT typecheck; this proves it compiles
pnpm --filter <frontend> typecheck
pnpm --filter <frontend> test:e2e       # routing suite green
pnpm --filter <frontend> dev            # then open a BROWSER
```

Open the **public version** in a browser, as a non-administrator. This is the first moment in the
entire process where the public app can regress: a promoted component now renders for real users.
Walk the public flow, confirm the promoted components render **and are styled** (both silent CSS
traps in §3 produce a page that renders, does not error, and is missing its colour — only a human
eye catches them), and confirm zero console errors. Building green is necessary and not sufficient;
say plainly that you verified in a browser, and paste what you ran.

---

## Gates

- **Hard stop on a breaking props diff** (§1). Never bypassed by the agent.
- **The contribution gate is the technologist's to answer** (§1.5), per component, before anything
  is folded. The agent never picks *contribute* on their behalf, and never merges or releases the
  pull request it opens.
- **A major bump only on the technologist's explicit decision** (rule 2).
- **The shipped-entry byte-identity guard is acknowledged only by a human**, on the design
  system's release workflow, never by this run and never from a laptop (rule 3, §5).
- **Visual diffs reported for human review**, never auto-accepted (§2, §4).
- **The public app verified running in a browser** before success is reported (§6).

---

## Outputs

- shipped `src/components/` including the promoted set, `src/index.ts` and `src/index.css` merged
- the promoted staging version and its subpath exports **gone**, the staging guards green
- a new published design-system version — released from `DS_REPO`'s workflow after the pull
  request merges, not from here — and every consumer repinned
- one branch and one commit in `DS_REPO`, one per consuming app; the promotion PR is opened
  against `PTV-Mobility/design-system-uds`, unmerged and unreleased, from the staging section of
  [`../templates/pr-description.md`](../templates/pr-description.md)
- a row in `docs/design-local-components.md` for every component answered *deliberately local*

## Final report

1. The props diff, per override, with the verdict — and, if it stopped, exactly what broke.
1. The contribution gate: each component, the answer given, and who gave it. Name the pull
   request opened against `PTV-Mobility/design-system-uds` and state plainly that it is neither
   merged nor released. List the rows written to `docs/design-local-components.md`, and list what
   was deferred without a record — that last list is the one worth reading.
2. The `BUMP` taken and why; if `major`, the confirmation that every consumer was reviewed.
3. The visual snapshot diffs, before vs after, flagged for human review.
4. What was folded, what was deleted, and the staging-guard output proving the removal was clean.
5. The published version and each consumer's resolved version.
6. The browser verification of the public app — pasted, not summarised — and the confirmation
   that the shipped-entry acknowledgement was given on the design system's release workflow by a
   person, not by you, and not as a local environment variable.

---

## Follow-on

Once promoted and shipped, the design version that carried these components is eligible for deletion
— prompt 07, **manual trigger only**, never as a follow-on from here.
