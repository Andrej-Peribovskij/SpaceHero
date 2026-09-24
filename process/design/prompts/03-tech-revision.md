# 03 — Tech revision

**Run by** the design technologist.

While wiring a version to real backends, the technologist discovers UX problems the mocked design
could not reveal: a list that is empty in practice, an error state nobody designed for, a flow that
needs a confirmation step. Those refinements do **not** go silently into a public version. They go
**back to the designer** as a new design version, `design/vX.Y.Z-tech`, and a pull request written
for them to read.

A `-tech` version is a design version like any other — administrator-only, off the public app — with
one difference: it is **backend-wired**, because it was born from wiring. That is the whole reason the
registry carries `wired` as a field and not as a folder convention.

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
| `BASE_DESIGN_VERSION` | the version being revised, e.g. `v4.1.0`. Must be in the registry. |
| `REVISION_NOTES` | what needs to change and why — the real-data findings that motivated each change |

If `BASE_DESIGN_VERSION` is not in the registry, stop and say so. This prompt revises an existing
design version; it does not create one from nothing — that is prompt 01.

---

## The rules that do not bend

Read these before writing anything. Each one exists because the alternative has bitten.

1. **This is a refinement, not a redesign.** A `-tech` revision carries the changes the *real data
   demanded* — an empty state, an error path, a confirmation step. A new design direction or a new
   set of screens is not this prompt; it is prompt 01, run by the designer. If the notes describe a
   redesign, stop and say the work belongs with the designer.
2. **`-tech` is an opaque label.** Never sort it, never compare it as semver — see
   `docs/design-versioning.md`. Under semver precedence
   `4.1.0-tech` is a prerelease and sorts *before* `4.1.0`, the exact inverse of the truth, since a
   tech revision always comes *after* the version it revises. Registry **array position** is the
   ordering, and the only ordering.
3. **Version-relative navigation is mandatory.** Every path the version navigates through goes
   through `useVersionNav` / `<VersionLink>`, never a `/vN` or `/design/…` literal. The ESLint rule
   bans the literals inside `src/pages/**` and it must report **zero** violations — it is the
   acceptance criterion, not polish. Its blind spot is paths composed at runtime from variables;
   read those yourself.
4. **The shipped design system is frozen.** Any design-system change this revision needs goes into
   `DS_REPO/src/staging/vX.Y.Z-tech/`, exactly as prompt 01 does — never into `src/components/`,
   `src/index.ts`, `src/index.css` or `src/lib/`. The shipped entry stays byte-identical, and the
   staging build proves it.
5. **Never `file:`, `link:`, `workspace:` or `portal:`** for the design system. The app consumes it
   only as a published registry package, `"DS_PACKAGE_NAME": "^x.y.z"`. Not temporarily, not to
   check something locally. A committed state that only builds with a local link is a broken commit.
6. **Two repos, two branches, two commits**, if the design system is touched at all. Never
   cross-commit, never stage a file from one repo while committing in the other.
7. **`wired` must be true to the code.** A `-tech` version talks to real backends, so it declares
   `wired: true`. If only part of it is wired this pass, say which part in the report and the PR and
   keep the field honest. A `wired` value that lies is the one unacceptable outcome, because
   everything downstream checks the field and never the folder.

---

## 1. Orient

Read before touching anything, and report a two-line summary of each so it is clear you did.

- `FRONTEND_PACKAGE/src/versions/registry.tsx` — the version table and the entry shape.
- `FRONTEND_PACKAGE/src/pages/design/BASE_DESIGN_VERSION/` — the version being revised. This is
  what you copy. Note whether it already owns an API client (`api.ts`) and a `BACKEND.md`.
- `REVISION_NOTES` — turn each finding into a concrete, screen-level change. If a note is a design
  direction rather than a data-driven refinement, flag it (rule 1) before proceeding.
- `docs/design-folder.md` — the four invariants,
  especially Invariant 2 (a version declares its wiredness and owns its client).

## 2. Name the revision

The revised version is `BASE_DESIGN_VERSION-tech` — `v4.1.0` becomes `v4.1.0-tech`. If a `-tech`
revision of this base already exists in the registry, this is a *second* revision and the base was
misidentified, or the earlier one should be iterated instead — stop and ask which. Do not invent a
`-tech-2` suffix.

Use `vX.Y.Z-tech` everywhere: the folder, the registry id, the staging folder (if any), the branch
names.

## 3. Branch both repos

```bash
cd APP_REPO && git checkout -b design/vX.Y.Z-tech
cd DS_REPO  && git checkout -b design/vX.Y.Z-tech    # only if the DS is touched
```

Cut each from its current branch and report the base each was cut from. If either repo has
uncommitted changes, stop and ask — do not stash someone else's work.

## 4. Copy the base version

Copy `FRONTEND_PACKAGE/src/pages/design/BASE_DESIGN_VERSION/` to
`FRONTEND_PACKAGE/src/pages/design/vX.Y.Z-tech/`. Everything moves with it, including a wired
version's `api.ts`, `types.ts` and `BACKEND.md` — a `-tech` revision of a wired version is wired
too, and owns its client for the same reason (see the deletability test in `design-folder.md`).

Leave the base version in place. It is the record of what the designer approved; deleting a design
version is prompt 07's job, on an explicit manual trigger.

## 5. Apply the refinements

Make each change from `REVISION_NOTES`, and only those. As you go:

- **Navigation stays version-relative** (rule 3). An export or a copied screen may carry a link
  *out* of the version — a "back to the app" button pointing at the public version. That is not
  version-internal navigation: use the host's public-version helper (`publicVersionPath()` or
  equivalent), which is outside the ESLint rule's scope by design. Converting it with
  `useVersionNav` would resolve it inside the design version and send the user nowhere. Say which
  you did, per such link, in the report.
- **A design-system change goes to staging.** If a refinement needs a new or changed component,
  stage it under `DS_REPO/src/staging/vX.Y.Z-tech/` following prompt 01 §4 — the entry shape, the
  `staging.css` import line and its traps, the raw-token rule, the subpath exports, the aggregate
  re-export, the stories. Do not repeat that content here; follow it there. If the revision needs
  *no* design-system change, touch neither `DS_REPO` nor `package.json`, and say so.
- **Keep the mocks that are still mocks, wire the parts the notes make real.** A `-tech` revision
  inherits the base's data sources. Where the real-data finding *is* that a mock was wrong, replace
  it against the existing client conventions (`FRONTEND_PACKAGE/src/api/client.ts`), re-hydrating on
  reconnect for any real-time channel, exactly as prompt 02 §B describes.

## 6. Register the revision

Append to `src/versions/registry.tsx`, inside the `INCLUDE_DESIGN_VERSIONS` branch:

```tsx
{
    id: "vX.Y.Z-tech",
    kind: "design",
    wired: true,
    label: "vX.Y.Z-tech — <what the revision addresses>",
    entryRoute: "",
    routes: [ /* one lazy loader per screen, paths RELATIVE — no "/design/" or "/vN" */ ],
},
```

- **Appended**, at the end. Array position is the ordering.
- `kind: "design"` — a `-tech` version is a design version. Analytics suppression keys off `kind`,
  deliberately not `wired`: a wired design version is still not production traffic.
- `wired: true` — true to the code (rule 7).
- Inside the `INCLUDE_DESIGN_VERSIONS` branch, every route element `lazy`, paths relative.
- `App.tsx` does not change. If you find yourself editing the router, the registry is not doing its
  job — report it, do not work around it.

## 7. Verify — run it, do not claim it

From `APP_REPO`:

```bash
pnpm lint                                        # root gate: 0 errors
pnpm --filter <frontend> lint                    # 0 errors, and 0 version-prefix violations
pnpm --filter <frontend> typecheck               # the app's build does NOT typecheck; this does
pnpm --filter <frontend> test                    # unit
pnpm --filter <frontend> build                   # not optional — see below
pnpm --filter <frontend> test:e2e                # routing suite — the revision must not break it
```

If the design system was touched: `cd DS_REPO && pnpm build && pnpm test` — the staging guards and
the script tests.

**`build` is on that list for a reason, and the routing suite is not a substitute.** A design
version's routes are lazy and the routing suite runs against a dev server, so a version whose chunk
cannot resolve an import at all still passes every routing test — nothing in the suite opens it.
Measured: a version importing an unpublished staging subpath passed 43 of 43 and failed `vite build`
on the first module. A green suite says the revision broke nothing else; only `build` and a browser
say the revision itself is sound.

Then look at it in a browser, as an **administrator** — `/design/*` sends an ordinary user to the
public app, which looks like breakage and is not:

```bash
pnpm --filter <frontend> dev    # reach /design/vX.Y.Z-tech
```

Walk every refined screen. Confirm each change reads as intended against real data, the staged
components (if any) are **styled**, there are zero console or network errors, and the URL bar never
shows a path you did not expect. A wired version **writes real records** — clicking through it is
not a dry run; do not exercise a destructive path on shared data without asking.

Report exactly what you ran and what it printed. Paste failures. Do not report a check you did not
run.

## 8. Commit

```bash
cd APP_REPO && git add -A && git commit    # pages/design/vX.Y.Z-tech, registry entry
cd DS_REPO  && git add -A && git commit    # staging/vX.Y.Z-tech, stories, exports, version bump — only if touched
```

One commit per repo. Check `git status` in both and confirm nothing crossed between repos. If the
design system was published, the magic-word rule from prompt 01 §11 applies — publishing is never a
side effect.

---

## 9. The gate — a pull request to the designer

There is no magic word here. The gate is the **designer's review**, which happens in prompt 04. Your
job is to hand them a pull request they can read.

Push the branch(es) and open the pull request **to the designer**, using the tech-revision section
of [`../templates/pr-description.md`](../templates/pr-description.md). The PR body is written for a
designer, not an engineer:

- **What changed on screen, and what the real data revealed** — first, in a table, one row per
  change. This is the part the designer reads.
- The preview URL: `/design/vX.Y.Z-tech` (administrator account required).
- **Implementation notes last.** The technical detail is real and belongs in the PR, but after the
  screen-level story, because the designer is the primary reader.

Then stop. The designer reviews live and either accepts or asks for another pass. Do not wire this
`-tech` version toward public, do not promote its staging components — those are separate prompts and
separate decisions.

---

## Outputs

- `FRONTEND_PACKAGE/src/pages/design/vX.Y.Z-tech/`, registered with `kind: "design"` and
  `wired: true`
- a `DS_REPO/src/staging/vX.Y.Z-tech/` staging folder, only if the revision needed one
- one branch per repo, one commit per repo, never cross-committed
- a pull request addressed to the designer

## Final report

1. Each refinement made, tied to the real-data finding that motivated it — and any note you rejected
   as a redesign (rule 1).
2. Whether the design system was touched, and if so what was staged and whether it was published.
3. Every link *out* of the version and how it was handled (rule 3 / §5).
4. Verification output — what was run, what it printed, what could not be run and why.
5. The branch name(s), the preview URL, and the pull-request link addressed to the designer.
