# 04 — Preview and export

**Run by** the designer.

Closes the loop. The designer reviews a technologist's `-tech` revision live, then exports it in a
form the design tool can read — so visual tweaks happen back in the design tool, and the next cycle
starts from prompt 01. Or the designer starts a design pass from **what ships today**, and exports
the registry's production entry directly, with no `-tech` revision in between.

Nothing here leaves the machine. This prompt **reads and writes a zip**. No branch is pushed, no
package is published, no registry is touched.

### Three entry points, and they share nothing

| | **Preview** (§1–2) | **Export** (§3) | **Export the production version** (§4) |
|---|---|---|---|
| Starts from | a `-tech` design version | a design version | the registry's **production** entry — the version the app serves publicly, or a named production id |
| Needs a runtime | yes — whichever one the version's `wired` field selects (rule 4) | **no** | **no** |
| Needs an install | yes | **no** | **no** (an install only lets it fall back to the installed design system — §4) |
| Needs the backend | when `wired: true`, which a `-tech` revision usually is | **no** | **no** — the mock data is fixtures the host recorded earlier, or explicitly none (rule 6) |
| What it is | a dev server | `node …/export-design-version.mjs` — pure `node:fs` and regex: no Playwright, no browser, no shell-out, nothing to install | the same exporter, `--mode production` |

**§3 and §4 are supported entry points on their own.** A designer who wants only a zip runs the
exporter against the source trees on disk and needs nothing else — no install, no dev server, no
container, no backend, no branch checkout beyond having the files. Go straight to §3 or §4; §1 and
§2 are not preconditions of either.

That is a property of the exporter rather than a concession: rule 3 keeps the export a readable
source tree instead of a running app, which is exactly what lets it stay dependency-free.

A run entered at §1 still ends at §3 when the designer asks for the zip. Both halves in one run
remains the common case; it is no longer the only one.

**§4 is a mode of the exporter, not another command.** Same wrapper, same rules, same format family
— what differs is where it starts. A design version is one self-contained folder
(`docs/design-folder.md`); a production version is not, so §4 walks its real import graph instead
of copying a folder.

---

## Bindings

The command wrapper that invoked this prompt carries a bindings block. Read it before anything else;
every path below is relative to it.

| Binding | Used by | Reference implementation |
|---|---|---|
| `PROCESS_ROOT` | **export** | where this process is installed. The exporter is `PROCESS_ROOT/scripts/export-design-version.mjs`; read the binding rather than assuming the path |
| `APP_REPO` | both | `.` |
| `FRONTEND_PACKAGE` | both | `apps/web` — relative to `APP_REPO`; the exporter's `--frontend` is `APP_REPO/FRONTEND_PACKAGE` |
| `DS_REPO` | preview | `../design-system-uds` — the design-system repository, a sibling checkout |
| `DS_REPO_PATH` | **export** | `../design-system-uds` — the tree handed to the exporter as `--design-system`. It must hold `package.json` **and** `src/`: the exporter resolves components from source. **Required by §3**; §4 degrades without it (§4, "The design system"). Written relative to `APP_REPO`: run from a linked git worktree, the exporter retries it against the main checkout |
| `DS_PACKAGE_NAME` | preview, **export** | `@my-app/design-system` — what the frontend pins, installs and **imports**. The exporter's `--ds-package`: it matches imports by this name, so a frontend that aliases the design system (`"@my-app/design-system": "npm:…"`) finds none of its components without it. **Not a substitute for `DS_REPO_PATH`** — `node_modules/@my-app/design-system` ships `dist/` and structurally cannot serve §3 |
| `ASSETS_DIR` | export | `design-commands/assets` — committed reference images + `registry.json` for content the export can't render itself (see its `README.md` and adoption.md's "`design-commands/assets/`" section) |
| `FULL_STACK_CMD` | preview, `wired: true` | the whole app (all backends + frontend), run from `APP_REPO`. **Never auto-detected**, by design: the host records it in `design-process.config.json`. No example is given here on purpose — the last one this table carried, `pnpm dev:full`, was the *guess* this binding exists to replace, and the reference host's real command is `pnpm dev` |
| `FRONTEND_ONLY_CMD` | preview | `pnpm --filter <frontend> dev` — the frontend dev server alone |
| `DESIGN_PREVIEW_CMD` | preview, `wired: false` | the design-preview seam (`design-commands/README.md` requirement 6), or empty when the host declares none |
| `PREVIEW_URL_BASE` | preview | `http://localhost:5173` — where the app answers once the chosen command is up |
| `PUBLIC_VERSION_SHOW_CMD` | **production export** | how to read which version the repository declares public, resolved by the host's documented precedence when it declares it in more than one place — the default `VERSION` of §4 when none is named. Never inferred from `PROD_VERSIONS[0]`, which is the fail-safe, not the public version |
| `PROD_SHELL_ENTRIES` | **production export** | the app-shell screens a user's journey passes through that are **not** registry routes — sign-in, registration — as `<route>=<file>[#Component]`, the file relative to `FRONTEND_PACKAGE`. Each becomes one `--shell`. Declared, never discovered: walking the app's router would drag in every registered version through the registry's own imports. An empty list is a valid value |
| `FIXTURES_DIR` | **production export** | where the host keeps recorded API answers, one folder per version (`FIXTURES_DIR/VERSION/index.json`), or `null` when it records none. The exporter's `--fixtures` (rule 6) |
| `FIXTURE_CAPTURE_CMD` | **production export**, on request only | the host's command that (re)records `FIXTURES_DIR/VERSION` from a running **local** stack, or `null`. Named in a report; run only when asked (§4, "Recording fixtures") |

**A binding that is a placeholder in the wrapper is a finding, not a value to guess** (rule 5). Run
the command a binding names; never a literal you inferred.

**Where the exporter itself lives.** `PROCESS_ROOT` — the binding names it, and the exporter is
`PROCESS_ROOT/scripts/export-design-version.mjs`. Read `PROCESS_ROOT` off the wrapper and join
the rest to it; a literal path written from memory is wrong the moment the process moves. Do not
assume the layout, and no longer derive the root by reading the wrapper's own
`Follow the process defined in @…` line back — that was this prompt's workaround while no binding
carried it, and `PROCESS_ROOT` is that binding. The wrapper states both from one value, so the
binding and the `@`-reference cannot disagree.

## Inputs

| Input | Needed by | Notes |
|---|---|---|
| `VERSION` | all | the version to preview and export, e.g. `v4.1.0-tech`. Must be in the registry. For §4, a **production** id; when the designer asks for "what ships" without naming one, it is the public version `PUBLIC_VERSION_SHOW_CMD` reports — say which it was |
| `PR_BRANCH` | preview only | optional: the branch carrying the `-tech` revision to review, if it is not already checked out |
| `OUTPUT_PATH` | export only | optional: where to write the zip. Defaults to the current directory. |

**An export-only run needs `VERSION` and two directories on disk** — `APP_REPO/FRONTEND_PACKAGE`
and `DS_REPO_PATH` — and nothing else. No `PR_BRANCH`, no install, no dev server, no backend. If
the files are already checked out, the export can run. §4 needs even less: without `DS_REPO_PATH`
it still runs, and says what it could not include.

If `VERSION` is not in `FRONTEND_PACKAGE/src/versions/registry.tsx`, stop and say so — that file is
where every entry point reads the version from, the preview for its `wired` field (rule 4) and the
exports for its route graph. §4 needs a `kind: "prod"` entry specifically: a registry may hold the
same id twice, as a production and a design entry, and §4 never exports the design one. If a
`PR_BRANCH` is given and the working tree is dirty, stop and ask — do not stash someone else's
work to check out a branch.

---

## The rules that do not bend

1. **This prompt performs no remote operation.** No push, no PR, no publish, not of anything. It
   at most checks out a branch already pushed by prompt 03, runs a dev server, and runs a copy
   script — an export-only run does none of the first two. §4's fixture capture, when it is asked
   for at all, reads from a stack on **this machine** and nothing else; its runner refuses any other
   address. If a step seems to need the network, you have wandered out of this prompt.
2. **Never `file:`, `link:`, `workspace:` or `portal:`** for the design system. Preview installs the
   version's dependencies exactly as they are pinned — a published registry package, `^x.y.z`. If the
   install fails because a staging subpath is not yet published, that is a real finding to report,
   not something to paper over with a local link.
3. **The export is a readable source tree, never a running app.** The design tool reads code; it does
   not execute applications and it does not push changes back. A runnable scaffold, a build step, or
   a rendered screenshot of a *screen* in the export is dead weight — see §the export format. The one
   deliberate exception is `ASSETS_DIR`: a small, host-committed library of static images standing in
   for content that structurally cannot be rendered from code at all (a live map/WebGL/canvas view).
   That is a human-curated registry, not the exporter screenshotting anything itself — see §3 below.
4. **The preview runtime follows the version's registry entry, not this prompt.** Read `wired` on
   `VERSION`'s entry in `FRONTEND_PACKAGE/src/versions/registry.tsx` *before* choosing a command,
   and say in the report which command you ran and which value of `wired` chose it.

   - **`wired: true` → `FULL_STACK_CMD`.** **This is the usual case here.** A `-tech` revision from
     prompt 03 is `wired: true` — prompt 03 rule 7 requires the field to be true to the code, and a
     `-tech` version was born from wiring. Its screens call real endpoints, so a frontend-only
     server shows them failing. A running backend is a precondition: confirm it is installed and
     starts before printing a URL.
   - **`wired: false` → `DESIGN_PREVIEW_CMD`.** The version's data is mocked by construction
     (prompt 01 §7.3), so nothing it renders needs a backend. What it still needs is an
     administrator session, because `/design/*` is administrator-only — and that is exactly what
     the design-preview seam supplies (`design-commands/README.md` requirement 6). A repository that declares
     no seam leaves `DESIGN_PREVIEW_CMD` empty; then run `FULL_STACK_CMD` as before.
     `FRONTEND_ONLY_CMD` on its own is not the fallback — it boots the app but leaves `/design/*`
     behind the administrator gate.

   **This does not make prompt 04 a backend-free prompt.** Most runs reaching here are `-tech`
   revisions and take the first branch. What changed is that the prompt *reads the field* instead of
   assuming an answer.

   **And the old justification does not survive contact with a real host.** This rule used to say
   the frontend-only server returns an "internal server error". Measured against the reference
   implementation on 2026-09-16 — the frontend dev server and nothing else, no container, no
   database, no backend service — it does not: a `wired: false` version's six routes all rendered,
   the app attempted exactly one backend call (`GET /api/v1/public-config`), its documented fallback
   ran and logged that it had, and there was no error boundary and no failed chunk. Do not carry
   that claim forward — and do not replace it with its opposite. That measurement is one host and
   one `wired: false` version. A frontend that genuinely hard-fails with its API unreachable is a
   real shape, and such a host declares itself by leaving `DESIGN_PREVIEW_CMD` empty. What the
   measurement settles is only that "no backend" and "broken" are not the same thing, and that the
   deciding inputs are the `wired` field and the host's own declaration — not an assumption made
   here.
5. **Never ask the designer a technical question.** As in prompt 01: a designer is not asked which
   library or version to depend on, whether a package or an environment resource (an API token, a
   service URL) is available, or what architecture to use. If a preview will not run because a
   dependency or its environment resource looks missing, that is a *finding to report* (rule 2), not
   a question to put to the designer — the canonical public version and the app's environment file
   already say what is depended on and configured, so read them (`APP_REPO/.env`, the lockfile)
   rather than asking. The only things the designer decides here are review acceptance and whether to
   export.
6. **A production export says what its mock data is — never leaves it implicit.** A production
   version is normally `wired: true`: every figure arrives from the API, so its source carries no
   mocks, and a hand-written mock of a wired screen drifts from the contract the day a field moves.
   So the answer is exactly one of two, and the export's README states which:

   - **`FIXTURES_DIR` is bound** → the export ships `FIXTURES_DIR/VERSION`: API answers the host
     **recorded** from a running local stack (GET only), optionally **curated** under the contract
     in §4 — and the README repeats every curation note verbatim. A bound source that holds nothing
     for `VERSION` is a finding: report it, name `FIXTURE_CAPTURE_CMD`, and still export, with the
     README saying none were recorded.
   - **`FIXTURES_DIR` is `null`** → **explicitly none.** The export carries no data, and the README
     says so and why. Never invent a mock to fill the gap — that is exactly what this rule forbids.

   A `wired: false` production entry keeps whatever data it shows in its own source, which the
   export copies with the rest; the README says that too.

---

## 1. Preview

Check out the revision, then **read `VERSION`'s registry entry and let its `wired` field pick the
runtime** (rule 4). Choose the command before you start anything.

```bash
cd APP_REPO
git fetch && git checkout PR_BRANCH        # if the branch is not already the working tree
<the host's package manager> install       # resolves the pinned DS version from the registry
                                           #   — read it off the host, never a literal `pnpm`

FULL_STACK_CMD                             # wired: true — all backends + frontend. The usual case.
DESIGN_PREVIEW_CMD                         # wired: false — the host's design-preview seam;
                                           #   host declares none → FULL_STACK_CMD (rule 4)
```

State the choice out loud when you print the URL: *"`VERSION` is `wired: true`, so this is
`FULL_STACK_CMD`"* — one line, so the designer and the next reader can both see the field decided
it. If the binding you need is a placeholder in the wrapper (`FULL_STACK_CMD` is never
auto-detected, by design), that is a finding to report, not a command to invent.

For a `wired: true` version do **not** substitute `FRONTEND_ONLY_CMD`: its screens call real
endpoints and will show them failing, which reads as a broken revision and is not. Confirm the
backend is installed and starts (its databases, services and a seeded administrator are
prerequisites); if it will not start, that is a setup finding to report, not something to work
around with the preview server.

Print the **exact URL** for the designer:

```
Review it here:  PREVIEW_URL_BASE/design/VERSION       # e.g. http://localhost:5173/design/v4.1.0-tech
  (an administrator account is required — an ordinary user is redirected to the public app,
   which looks like the version being broken and is not)
```

`/design/*` is administrator-only. A seeded ordinary user lands on the public version instead. Say
so plainly so the designer does not misread the redirect as a bug. Under `DESIGN_PREVIEW_CMD` the
seam is what holds that administrator session; under `FULL_STACK_CMD` a seeded administrator
account is.

## 2. Wait

The designer reviews and may iterate — follow-up prompts to adjust the revision, or a decision to
send it back through prompt 03 for another pass. This prompt does not decide acceptance; the designer
does. Return to this stop after each iteration.

## 3. Export — on request, and runnable on its own

Two ways in, and **they run identically**: the designer asks for the zip at the end of a review
(§1–2), or the export *is* the whole request. In the second case start here. The exporter needs no
install, no dev server, no backend, no container and no branch checkout — it is pure `node:fs` and
regex, it starts no browser, it shells out to nothing, and it never mutates a source tree (rule 3
is why it can stay that way). What it needs is `VERSION` and two directories on disk.

Run the exporter only when the designer asks for it — in an export-only run, the request itself is
the asking:

```bash
node PROCESS_ROOT/scripts/export-design-version.mjs \
  --version VERSION \
  --frontend APP_REPO/FRONTEND_PACKAGE \
  --design-system DS_REPO_PATH \
  --ds-package DS_PACKAGE_NAME \
  --assets ASSETS_DIR \
  --out OUTPUT_PATH
```

`--ds-package` is how the exporter recognises a design-system import. Leave it out and it falls
back to the name in `DS_REPO_PATH/package.json`, which is wrong for any frontend that installs the
design system under an alias — every component import is then silently not one.

`PROCESS_ROOT` comes from the bindings block like every other path here — see "Where the exporter
itself lives" above. It is whatever the wrapper says it is, and writing a literal path instead
is wrong on every npm-path run.

**`--design-system` is required, and it must be the DS repo's SOURCE tree**: `DS_REPO_PATH`, a
directory holding `package.json` **and** `src/`. `node_modules/DS_PACKAGE_NAME` cannot serve it and
is not a fallback — the exporter resolves the version's design-system components transitively *from
source*, on purpose, because the published artifact ships `dist/` and a self-contained staging
bundle, and copying that would bury the source the design tool is meant to read under bundled
noise. If `DS_REPO_PATH` is a placeholder in the wrapper, the export cannot be completed: report
that as the finding it is (rule 5). There is no npm-path substitute for the checkout.

The other three: `--frontend` is the frontend package, not `APP_REPO` — pass it explicitly, since it
otherwise defaults to the current directory. `--assets` is optional, and omitting it is a real
change in the report rather than a silent one: no reference image can be matched, so **every**
live-render file comes back unresolved. `--out` also defaults to the current directory; pass
`OUTPUT_PATH`.

It is a **pure copy** — it never mutates a source tree. It resolves, from source, the design-system
components the version *actually imports transitively* (not the whole library, not `dist/`), reads
the version's **design** registry entry for the route graph, resolves every in-app `nav()`,
`navigate()` and `<VersionLink to>` against those routes — comments excluded, so a doc example is
not a flow — (so a dynamic destination isn't left for a guess), matches any live-render file against
`ASSETS_DIR/registry.json`, and writes `VERSION-export.zip`. Read its output: it prints the screen
inventory, the resolved component set, how many navigation calls resolved, and which live-render
files got a reference image versus which didn't — so a wrong version id, a missed import, or a
misrouted button is visible before the zip is handed off.

**If the exporter reports a live-render file with no reference image**, that is your cue to ask the
designer — do not silently skip it and do not silently start capturing one yourself. Tell them what
was flagged (the file, the library) and let them choose: supply an image (walk them through
`ASSETS_DIR/README.md` — save the PNG there, add a `registry.json` entry, scoped with `versions`
when the flagged file is shared with other versions, re-run this export) or
accept the gap and rely on the live preview for that piece. Either answer is a legitimate decision
for the designer to make, not something to resolve on their behalf.

## 4. Export the production version — what ships, with no `-tech` revision

**Use it when** a design pass should start from the UI real users get today rather than from the
last design version that was approved — which may be months and several wired changes behind it.
It is an entry point of its own, like §3: no install, no dev server, no backend, no container. The
rules above all hold, unchanged — no remote operation (rule 1), a readable source tree and no
screenshot beyond `ASSETS_DIR`'s curated references (rule 3), no technical question to the designer
(rule 5), and the mock-data answer stated, not implied (rule 6).

**Which version.** The one the designer names, if it is a production id; otherwise the public
version, read with `PUBLIC_VERSION_SHOW_CMD` — say in the report which of the two it was. A host
may declare the public version in more than one place. If it documents an order in which they win
— an environment variable over a committed default, say — the command resolves by that order, and
you take its winner and name where it came from. Stop and report, rather than choosing, only when
the host's own resolution is ambiguous: its declarations disagree and it documents no order that
settles them, or the command itself reports that it cannot tell.

```bash
node PROCESS_ROOT/scripts/export-design-version.mjs --mode production \
  --version VERSION \
  --frontend APP_REPO/FRONTEND_PACKAGE \
  --design-system DS_REPO_PATH \
  --ds-package DS_PACKAGE_NAME \
  --assets ASSETS_DIR \
  --shell "<route>=<file>[#Component]"     # once per PROD_SHELL_ENTRIES item; none when it is empty
  --fixtures FIXTURES_DIR/VERSION          # only when FIXTURES_DIR is not null
  --out OUTPUT_PATH
```

**In Git Bash (MSYS) on Windows**, an argument that starts with `/` is rewritten as a Windows path
before Node sees it: `--shell "/login=…"` arrives as `C:/Program Files/Git/login=…`. The exporter
refuses such an entry and says why; the fix is to run the command with `MSYS_NO_PATHCONV=1` set
(`MSYS_NO_PATHCONV=1 node PROCESS_ROOT/scripts/export-design-version.mjs …`), or from PowerShell.

**What it walks.** The registry's `kind: "prod"` entry for `VERSION` — never a design entry of the
same id. From each route's component (a direct import in the registry, or a `lazyPage()` path), plus
each declared shell screen, plus the stylesheets the frontend's entry module imports, it follows
every relative import — static, re-exported and dynamic — across the **whole** of the frontend's
`src/`: views, infrastructure, utilities, whatever the app grew. Tests, test helpers and stories are
excluded. Every file keeps its path under `src/`, so each import in the copy still resolves. A
relative import that leads outside `src/` is reported, not followed.

**The design system.** From `DS_REPO_PATH`'s source tree when it is available, exactly as in §3,
including the bare `DS_PACKAGE_NAME/staging` alias (its barrel is an `export *` of the newest staging
version). When no source tree can be found — the exporter lists every place it tried, including the
main checkout when run from a linked worktree — it does **not** stop: it falls back to the
*installed* `DS_PACKAGE_NAME` under the frontend, takes the component **names** and the token
stylesheet from it, copies no component source, and says so loudly in its output and in the README.
That is a finding to report, not a pass: the designer gets the screens and the tokens, not the
design-system components' source. §3 keeps its hard requirement, because a design version's
staging components exist nowhere but in source.

**The mock data** is rule 6's answer, carried out: `--fixtures` when `FIXTURES_DIR` is bound, and no
flag when it is `null`, in which case the README states that none are included and why.

Read its output as in §3 — the routes and shell screens it walked, the source-file count, the
design-system mode (source or installed), the components, the mock-data line, the flows, and any
live-render file without a reference image, which you raise with the designer exactly as §3 says.

### Recording fixtures — the host's, on request only

Fixtures are recorded **before** an export, not by it: recording needs a running stack, and §4 does
not. When `FIXTURES_DIR` is bound and holds nothing for `VERSION`, or the designer says the recorded
answers are stale, report it and name `FIXTURE_CAPTURE_CMD`. Run it only when asked, only against a
stack started with `FULL_STACK_CMD` on this machine, and say that it writes into the repository
(`FIXTURES_DIR/VERSION`), which is a change somebody commits.

The generic part is this process's own: `PROCESS_ROOT/scripts/capture-fixtures.mjs` records the
answers — **GET only**, loopback only, each query-string variant the UI really sends as its own
file, one answer recorded under every key the UI reads it by, large answers written compact, file
names capped so a long query string cannot break a checkout on Windows — from a **plan** the host
writes: which requests, which ids to follow, how to sign in to a local development account.
`PROCESS_ROOT/scripts/curate-fixtures.mjs` then applies the host's declared edits and refuses any
that break the curation contract:

1. **Never change a figure.** Every number in every answer is one the API actually answered. The
   capture keeps a record of those numbers beside the index (`recorded-numbers.json`), and
   curation checks against it rather than against the answer files, so a re-run is as strict as
   the first and a figure edited by hand after curation is refused. Assembling a record from real
   answers, inventing only ids, timestamps and provenance, is allowed, and its note must say so.
2. **Each edit removes one named artefact of the development database**, and says which.
3. **Idempotent**, with one note per edit in the fixtures index under `curated` — the notes the
   export's README repeats verbatim.

A 5xx during capture from a stack whose services started out of order is usually transient (a
circuit breaker still open): wait, and capture again.

---

## The export format

A **readable source tree**, not a runnable application:

```
VERSION-export/
  README.md              what this is, the flow, the screen inventory, how to read the tree
  screens/               the version's screens
  components/            version-specific composites
  design-system/         the staging + shipped components actually used, in source form
  tokens/                the token map — colour, typography, spacing, elevation
  data/                  mock data, so screens can be read in context
  assets/                public/ files a screen references by root-absolute URL, re-pointed at
                          this local copy; assets/reference/ holds any ASSETS_DIR-registry image
```

§4 writes the same family, shaped by a version that is not one folder:

```
VERSION-production-export/
  README.md              routes + shell screens with each one's reachable API calls, flows,
                          the mock-data statement (rule 6), the design-system mode
  src/                   every file the routes reach, at its path under the frontend's src/
  design-system/         as above — or absent, and the README says why (§4, "The design system")
  tokens/                tokens.css; tokens/design-system/, the DS's token sources, when in source
  data/                  api/*.json, index.json and mock-api.json (request → answer) — ONLY when
                          FIXTURES_DIR supplied them; otherwise absent, and the README says so
  assets/                as above
```

This shape is deliberate, and it is worth knowing why, because the temptation is always to add more:

- **The design tool reads code.** It rebuilds these screens as editable design components with the
  tokens wired in as tweakable properties. It does not execute applications, so a runnable scaffold
  — a `package.json`, an entry point, a build — would be weight it never runs.
- **No screenshots of a *screen*, no browser dependency in the exporter itself.** The tool works
  from code alone. Rendering a screen would put a Playwright/browser dependency into every export
  for a picture the tool does not need. `assets/reference/` is the one exception, and it is not the
  exporter rendering anything — it is a human-curated image copied verbatim from `ASSETS_DIR`, for
  the narrow case where the real content cannot be produced from code at all (see §3, "the rules
  that do not bend" #3). The exporter still has no browser dependency, on purpose (see
  `docs/design-testing.md`).
- **Only the components the version uses.** Copying the whole design system buries the handful that
  matter in dozens that do not. The exporter walks the imports and takes exactly those, in source
  form, so the tool sees the real component the screen renders.
- **It does not come back this way.** The tool does not write into this tree. The return path is the
  tool's own "Handoff to Claude Code" export, which becomes prompt 01's `SOURCE_PATH`.

---

## Gates

None. Nothing is pushed and nothing is published — this prompt reads and writes a zip.

---

## Outputs

- a live preview URL for the designer (preview runs)
- `VERSION-export.zip`, a readable source tree (export runs — including export-only ones)
- `VERSION-production-export.zip`, the same for a production entry (§4 runs)

## Final report

1. The preview URL, the note that an administrator account is required, **and which command you ran
   with the `wired` value that chose it** (rule 4). On an export-only run, say that instead: no
   preview was started, and none was needed.
2. What the exporter resolved: the screen inventory and the component set it copied, pasted from its
   output — and any import it could not resolve.
3. Any navigation destination it could not match to a route, and any live-render file with no
   reference image — the latter is what you ask the designer about (§3).
4. The path to the written zip.
5. Anything the preview revealed that the designer should carry into the next design pass.
6. On a §4 run: which production id was exported and why that one (named, or the public version
   `PUBLIC_VERSION_SHOW_CMD` reported); the shell screens walked; whether the design system came
   from source or — a finding — from the installed package; and the mock-data answer in one line:
   how many recorded answers and curation notes, or *none, because `FIXTURES_DIR` is `null`*, or
   *none recorded for `VERSION` — `FIXTURE_CAPTURE_CMD` records them*.

---

## The loop

```
04 export  →  design tool rebuilds as editable components  →  designer tweaks visually
           →  "Handoff to Claude Code" export  →  01 create-design-version  →  …
```

§4 enters the same loop from the other side: the production export is where a design pass starts
when the last design version is no longer what ships.
