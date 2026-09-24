# Design-system staging

## The problem

A new design version needs new components, and changes to existing ones. Putting those straight
into the shipped design system would change the public app the moment it reinstalls — for a
design that may never ship.

Staging solves it with a **subpath export**: one package, two entry points.

---

## Layout

```
design-system-uds/src/
  components/              SHIPPED. Frozen for the duration of a staging cycle.
  index.ts                 shipped entry
  index.css                shipped styles
  staging/
    v4.0.0/
      components/          new components, and overrides of shipped ones
      index.ts             this version's build entry
      staging.css          this version's styles
    v4.1.0/
      components/
      index.ts
      staging.css
    index.ts               declares which version is the newest — one line, replaced
```

Each version is a **build entry of its own**, compiled in its own pass into
`dist/staging/vX.Y.Z/`. `package.json`:

```json
{
  "exports": {
    ".":                    { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./index.css":          "./dist/index.css",

    "./staging":            { "import": "./dist/staging/v4.1.0/index.js", "types": "./dist/staging/index.d.ts" },
    "./staging.css":        "./dist/staging/v4.1.0/index.css",

    "./staging/v4.0.0":     { "import": "./dist/staging/v4.0.0/index.js", "types": "./dist/staging/v4.0.0/index.d.ts" },
    "./staging/v4.0.0.css": "./dist/staging/v4.0.0/index.css",
    "./staging/v4.1.0":     { "import": "./dist/staging/v4.1.0/index.js", "types": "./dist/staging/v4.1.0/index.d.ts" },
    "./staging/v4.1.0.css": "./dist/staging/v4.1.0/index.css"
  }
}
```

The unpinned `./staging` and `./staging.css` are an **alias for the newest version**, and that
is all they are — they resolve to the newest version's own artefacts rather than to a bundle of
their own, so a consumer that reaches for both never gets two copies of one component.

A design version imports shipped primitives from the package root and anything new or changed
from the **pinned** staging subpath:

```ts
import { Card, Input } from "@space-hero/design-system";
import { TimelineRail } from "@space-hero/design-system/staging/v4.0.0";
```

**Application code never imports the unpinned `./staging`.** It follows "newest", so a design
version that used it would silently change what it renders the day somebody else stages the
next version — the version's screens would drift without a single line of it being edited. The
alias exists for exploration, and Storybook stories pin their own version too (`./index`, never
`../index`).

---

## One build pass per version

Not one pass with several entries. A multi-entry pass makes Rollup hoist whatever two versions
have in common into a shared chunk, and from then on **v4.0.0's artefact changes when v4.1.0
changes** — silent coupling between two things whose entire purpose is to be independent and
independently deletable. The cost of a pass each is a few seconds of build time and a
duplicated copy of `cn` in a bundle no production app ever loads.

This is the same argument that keeps the shipped entry in a build pass of its own — a single
build with several entries makes Rollup split shared code into a common chunk, and the shipped
`index.js` stops being self-contained — applied one level down.

### Two checks, run on every build and again at `prepublishOnly`

- **exports ↔ folders ↔ newest.** Every version folder has a matching pair of subpaths, every
  subpath has a matching folder, and the unpinned alias points at the version the aggregate
  declares. The map stays hand-written — it is the published contract, and generating it would
  hide exactly the edit a reviewer should see — but its agreement with the source tree is not
  left to attention.
- **Isolation.** Each built artefact is imported and its runtime exports compared against what
  its own entry declares. More means another version leaked in. A name exported by two versions
  must resolve to two *different* objects, or they are sharing a chunk. And each version's
  stylesheet must be non-empty, because the `@reference` trap below produces an empty one and
  reports nothing.

The listing check that would seem sufficient is not: `dist/` looked entirely healthy while
`./staging` and `./staging/v4.0.0` both pointed at one file.

---

## The freeze rule

**While a staging cycle is open, `src/components/` and `src/index.ts` do not change.**

This is what makes publishing safe. A publish that adds staging components produces a package
whose *shipped* entry output is byte-identical to the previous version's. The public app can
therefore reinstall and upgrade with a proof, not a hope, that nothing moved.

### Enforcement

CI builds the shipped entry at the previous version and at the candidate version and diffs the
output. A non-empty diff fails the build. The rule is not a convention — it is checked.

If a shipped component genuinely must change mid-cycle (a production bug), that is a separate
patch release off the shipped line, and the staging branch rebases onto it.

---

## A stylesheet per staging version

Staging styles never enter `index.css`, and they do not share one file across versions either.
Each version's `staging.css` lives in the version folder, is imported by that version's own
`index.ts`, and compiles to `dist/staging/vX.Y.Z/index.css`. A design page loads it alongside —
never instead of — the shipped stylesheet.

Folding staging styles into the single `index.css` would be simpler and is wrong: a staging
component that overrides a class shared with a shipped component would silently restyle the
public app, and the byte-diff on the JS entry would not catch it. Sharing one stylesheet
*between staging versions* is the same mistake one level down.

### The import line, and the trap in it

```css
@import "tailwindcss/utilities.css" source("./");
```

Three things about that line, each of which cost an experiment:

1. **`utilities.css`, not `tailwindcss`.** The full import also emits preflight and the default
   theme, and an app loading both stylesheets gets every base reset twice.
2. **`source("./")`** scopes candidate scanning to this version's directory. Without it,
   automatic detection scans the whole project: the file balloons with utilities for classes
   used elsewhere, and — the part that matters — another staging version's classes land in it.
3. **No `@reference "../../index.css"`.** It looks like the right way to borrow the design
   system's theme and it is a trap: `@reference` inherits the referenced file's *source
   configuration*, including its `@source not "./staging"`, so the stylesheet excludes its own
   directory and emits nothing at all. The component renders unstyled and **nothing anywhere
   reports an error**. It is not needed either — theme utilities compile to
   `var(--color-success)` and friends regardless, and those variables come from `index.css`.

Also: `source(none)` disables generation entirely, and a plain additive `@source "./components"`
does **not** turn automatic detection off. Only the `not` form excludes.

---

## Versioning and publishing

The package version advances normally — `0.4.0` → `0.5.0` — for a publish that only adds staging.
The version number covers the whole package; the *shape* of the change is that only the staging
subpath gained surface.

Consuming apps bump their dependency to the new version. The public app is unaffected because the
shipped entry is unchanged; design versions gain access to the new components.

### Pre-publish guard

A publish is rejected unless the local version strictly exceeds the highest version already on
the registry. This exists because drift has happened: a repository sat at `0.3.0` in source while
`0.4.0` was live and consumed. The guard makes that state unreachable.

---

## Storybook per staging version

Each staging version has its own Storybook stories, alongside the shipped ones. With multiple
designers working in the same staging area, it is the only place they can see each other's
components in isolation, and it is what the promotion snapshots are taken from.

---

## Multiple designers

Concurrency works the same way it does for any code:

- one staging folder per **version**, not per designer
- one branch per version
- a pull request is the merge point

Two designers on `staging/v4.1.0` coordinate through that branch. Two designers on *different*
versions never touch the same files.

---

## Promotion

Run by prompt 05, when a technologist accepts a design version.

1. **Props diff** — for every staging component that overrides a shipped one, diff the props API
   against the shipped version. **Hard stop on any breaking change**; it must be resolved
   explicitly, either by making the change backward-compatible or by taking a major version bump
   with every consumer reviewed.
2. **Visual snapshots** — Playwright screenshots of the shipped Storybook stories, before and
   after. Promotion is the one moment shipped components can visually drift, so this is where the
   check belongs. See [testing.md](testing.md).
3. **Fold** — move `staging/vX.Y.Z/components/*` into `src/components/`, merge exports into
   `src/index.ts`, merge styles into `index.css`.
4. **Delete** the staging folder and its subpath exports.
5. **Bump and publish** — minor for additions, major if the props diff was breaking.
6. **Repin** every consuming app and verify the public version still renders correctly.

Step 1 is the one that protects production. A staged component that overrode a shipped one with
different props is invisible until promotion, and then it breaks the public app.
